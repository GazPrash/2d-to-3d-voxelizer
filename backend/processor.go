package backend

import (
	"bytes"
	"context"
	"encoding/base64"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"math"
	"math/rand"
	"pix2dTo3dApp/backend/logger"

	"github.com/nfnt/resize"
)

func parseImage(base46Str string, settings Settings) (*InputImage, error) {
	data, err := base64.StdEncoding.DecodeString(base46Str)
	if err != nil {
		return nil, err
	}

	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		logger.Printf("Error decoding image: %v\n", err)
		return nil, err
	}

	bounds := img.Bounds()
	width := bounds.Max.X
	height := bounds.Max.Y

	if width > MaxImageWidth || height > MaxImageHeight {
		logger.Infof("Image is too large (%dx%d), resizing to fit within %dx%d...", width, height, MaxImageWidth, MaxImageHeight)

		img = resize.Thumbnail(uint(MaxImageWidth), uint(MaxImageHeight), img, resize.Lanczos3)
		bounds = img.Bounds()
		width = bounds.Max.X
		height = bounds.Max.Y
	}

	mode := SINGLE
	if settings.Layout == "quad" || (settings.Layout == "auto" && width >= height*4-8) {
		mode = QUAD
		width = width / 4
		settings.Shape = "flat"
		settings.FlatDepth = float64(width) / 2.0

		logger.INFO("Mode: QUAD [Left, Front, Right, Back]\n")

	} else if settings.Layout == "dual" || (settings.Layout == "auto" && width >= height*2-4) {
		mode = DUAL
		width = width / 2

		logger.INFO("Mode: DUAL [Side-by-side for front and back respectively]\n")

	} else {
		logger.INFO("Mode: SINGLE [Mirroring front texture to the back]\n")
	}

	logger.Infof("Processing image: %dx%d\n", width, height)
	inputImg := InputImage{
		img:      img,
		mode:     mode,
		settings: settings,
		bounds:   bounds,
		width:    width,
		height:   height,
	}

	return &inputImg, nil
}

/*
the whole point of DepthComputation is to create a depth matrix i.e [][]int
that has information about what depth should a given pixel on the 2d input image should be
extruded or expanded to in the newly created z-axis. So for example if you have an image of a circle,
we use this computation method to create a depth matrix for the sphere that needs to be created
and we convery that the central part of the sphere is supposed to be more inflated/extruded in the z-axis
then the the pixels on the edge, i.e the edge pixels of the circle. For this app, we actually prefer to first mould
the 3d shape into a capsule as it tends to fit most natural rounded shapes. Custom depth biases then can be further applied
to mould the shape as the user wants.

that said, this function isn't supposed be used for the flat-shape mode and QUAD and 6-SIDED modes.
*/
func DepthComputation(ctx context.Context, inpImg InputImage) *[][]int {
	if inpImg.settings.Shape == "flat" {
		return nil
	}

	width := inpImg.width
	height := inpImg.height
	// a finite infinity so that we are safe from overflow in EDTF, populated acc to the image
	Inf := float64((width+height)*(width+height) + 1000000)

	grid := make([][]float64, width)

	for i := range width {
		grid[i] = make([]float64, height)
		for j := range height {
			var aF, aB uint32
			switch inpImg.mode {
			case QUAD:
				_, _, _, aF = inpImg.img.At(i+width, j).RGBA()
				_, _, _, aB = inpImg.img.At(i+width*3, j).RGBA()
			case DUAL:
				_, _, _, aF = inpImg.img.At(i, j).RGBA()
				_, _, _, aB = inpImg.img.At(i+width, j).RGBA()
			default:
				_, _, _, aF = inpImg.img.At(i, j).RGBA()
				aB = 0
			}

			if aF == 0 && aB == 0 {
				// these are for transparent pixels, they will become holes/empty spaces in the resultant model ;)
				grid[i][j] = 0
			} else {
				// solid pixels
				grid[i][j] = Inf
			}
		}
	}

	// now we need to do the depth computation here by finding D(q)
	// based on the formula discussed in EuclideanDistanceTransform1D notes.
	// We do it concurrently for columns first and ten rows, and also check
	// if the process is too long and if the user has cancelled in between
	pool := NewWorkerPool(ctx, 0)
	for i := range width {
		col := i
		pool.Submit(func() {
			if ctx.Err() != nil {
				return
			}
			grid[col] = EuclideanDistanceTransform1D(grid[col], Inf)
		})
	}
	pool.Wait()

	// WARN: cannot do both row and col EDTs in parallel obv, both groups must be done sequentially
	if ctx.Err() != nil {
		return nil
	}

	rowEDTs := make([][]float64, height)
	pool = NewWorkerPool(ctx, 0)
	for j := range height {
		row := j
		pool.Submit(func() {
			if ctx.Err() != nil {
				return
			}
			rowSlice := make([]float64, width)
			for i := range width {
				rowSlice[i] = grid[i][row]
			}
			rowEDTs[row] = EuclideanDistanceTransform1D(rowSlice, Inf)
		})
	}
	pool.Wait()

	if ctx.Err() != nil {
		return nil
	}

	for j := range height {
		for i := range width {
			grid[i][j] = rowEDTs[j][i]
		}
	}

	depths := fattenImage(ctx, &grid, width, height, Inf, inpImg.settings)
	return depths
}

func EuclideanDistanceTransform1D(vector []float64, Inf float64) []float64 {
	n := len(vector)
	dist := make([]float64, n)

	vertices := make([]int, n)
	vertices[0] = 0

	// index of the active parabola
	k := 0
	/*
		The use of parabolas in EuclideanDistanceTransform1D comes from
		the mathematical algorithm devised by Felzenszwalb and Huttenlocher.

		1. Distance as a Quadratic Function
		In 1D, the squared Euclidean distance between two points; repr as:
		     d(q) = (q-p)^2

		for the transform we need to find D(q) for every pooint p (p repr a pixel here basically), where;
		D(q) = min_p((q - p) ^ 2 + f(p0)) ; where f(p0) is boundary values for the curve
		     i.e p = 0 for transparent pixels & p = Inf, for solid pixels

		d(q) repr a parabola, opening upwards, centered at p; and D(q) repr the lover envelope that we need for the E1DT
	*/

	intersections := make([]float64, n+1)
	intersections[0] = -Inf - 1
	intersections[1] = Inf + 1

	for i := 1; i < n; i++ {
		var s float64
		for {
			s = ((vector[i] + float64(i*i)) - (vector[vertices[k]] + float64(vertices[k]*vertices[k]))) / (2.0 * float64(i-vertices[k]))
			if s > intersections[k] {
				break
			}
			k--
		}
		k++
		vertices[k] = i
		intersections[k] = s
		intersections[k+1] = Inf + 1
	}

	k = 0
	for q := range n {
		for intersections[k+1] < float64(q) {
			k++
		}
		dist[q] = float64((q-vertices[k])*(q-vertices[k])) + vector[vertices[k]]
	}

	return dist
}

// populates the z-axis coordinates for the image based on the shape settings & chosen type (humanoid/static obj)
func fattenImage(
	ctx context.Context,
	grid *[][]float64,
	width int,
	height int,
	Inf float64,
	imgSettings Settings,
) *[][]int {
	distances := make([][]int, width)
	for i := range width {
		distances[i] = make([]int, height)
	}

	pool := NewWorkerPool(ctx, 0)
	for i := range width {
		col := i
		pool.Submit(func() {
			processFattenColumn(ctx, col, width, height, *grid, distances, Inf, imgSettings)
		})
	}
	pool.Wait()

	if ctx.Err() != nil {
		return nil
	}
	return &distances
}

func processFattenColumn(
	ctx context.Context,
	col, width, height int,
	grid [][]float64,
	distances [][]int,
	Inf float64,
	imgSettings Settings,
) {
	if ctx.Err() != nil {
		return
	}

	infThreshold := math.Sqrt(Inf) - 1

	for j := range height {
		// periodic cancellation check inside inner loop
		if j%64 == 0 && ctx.Err() != nil {
			return
		}

		if grid[col][j] == 0 {
			continue
		}

		if imgSettings.Shape == "flat" {
			distances[col][j] = int(math.Round(imgSettings.FlatDepth))
			continue
		}

		minDist := math.Sqrt(grid[col][j])

		// for non flat executions (non-repeated single, no-quad) i.e possible voxel generations, if it's a completely solid image,
		// use distance to edge
		if minDist >= infThreshold {
			minDist = math.Min(float64(min(col, width-col-1)), float64(min(j, height-j-1)))
		}
		if minDist <= 0 {
			continue
		}

		// transforming the base of the voxel to a rounded/capsule shape here
		r := math.Max(20.0, float64(min(width, height))*0.1)
		if minDist < r {
			minDist = math.Sqrt(minDist * (2*r - minDist))
		} else {
			minDist = r
		}

		// add dist bias for voxel randomization
		normalizedY := float64(j) / float64(height)
		if imgSettings.BiasedScalingEnabled {
			minDist *= customBias(normalizedY, imgSettings)
		} else {
			minDist *= defaultBias(normalizedY)
		}

		// organic Random Noise with a ±10% variation so it's not perfectly smooth
		minDist += (rand.Float64() - 0.5) * 0.2 * minDist

		distances[col][j] = int(math.Round(minDist))
	}
}

func customBias(normalizedY float64, settings Settings) float64 {
	if normalizedY < 0.5 {
		t := normalizedY / 0.5
		return settings.BiasedScaleTop + t*(settings.BiasedScaleMiddle-settings.BiasedScaleTop)
	} else {
		t := (normalizedY - 0.5) / 0.5
		return settings.BiasedScaleMiddle + t*(settings.BiasedScaleBottom-settings.BiasedScaleMiddle)
	}
}

// defaultBias returns a vertical depth multiplier using a symmetric bell
// curve centred at the middle of the sprite so the thickness is even
// from top to bottom.
func defaultBias(normalizedY float64) float64 {
	// Symmetric: thickest at the centre (y=0.5), tapering equally toward
	// both the top and bottom edges.
	// Range: 0.55 at the edges → 1.0 at the centre.
	t := 2.0 * (normalizedY - 0.5) // −1 … +1
	return 0.55 + 0.45*(1.0-t*t)   // parabolic bell
}
