package backend

import (
	"context"
	"math"
)

/*
	The aim of this service is to take an input image, user settings, and a 3d depth matrix
	and then prepare a 3D obj model out of it based on the user chosen settings
*/

func computeAverageColor(img InputImage) RGB {
	var sumR, sumG, sumB, count float64
	for i := range img.width {
		for j := range img.height {
			r, g, b, a := img.img.At(i, j).RGBA()
			if a > 0 {
				fa := float64(a)
				sumR += float64(r) / fa
				sumG += float64(g) / fa
				sumB += float64(b) / fa
				count++
			}
		}
	}
	if count > 0 {
		return RGB{
			r: uint8(math.Round((sumR / count) * 255.0)),
			g: uint8(math.Round((sumG / count) * 255.0)),
			b: uint8(math.Round((sumB / count) * 255.0)),
		}
	}
	return RGB{}
}

func getFrontBackColors(img InputImage, i, j int) (colFront, colBack RGB, aF, aB uint32) {
	var rF, gF, bF, rB, gB, bB uint32

	switch img.mode {

	case QUAD, SIX_SIDED:
		rF, gF, bF, aF = img.img.At(i+img.width, j).RGBA()
		rB, gB, bB, aB = img.img.At(i+3*img.width, j).RGBA()
	case DUAL:
		rF, gF, bF, aF = img.img.At(i, j).RGBA()
		rB, gB, bB, aB = img.img.At(i+img.width, j).RGBA()
	default:
		rF, gF, bF, aF = img.img.At(i, j).RGBA()
		rB, gB, bB, aB = rF, gF, bF, aF
	}

	if aF > 0 {
		colFront = unpremultiplyRGB(rF, gF, bF, aF)
	}
	if aB > 0 {
		colBack = unpremultiplyRGB(rB, gB, bB, aB)
	}
	return
}

func getSideColors(img InputImage, z, d, j int) (left, right RGB, aL, aR uint32) {
	var uLeft, uRight int
	var rL, gL, bL, rR, gR, bR uint32

	if d > 0 {
		uLeft = int(float64(z+d) / float64(2*d) * float64(img.width-1))
		uRight = int(float64(d-z) / float64(2*d) * float64(img.width-1))
	}

	if img.mode == QUAD || img.mode == SIX_SIDED {
		rL, gL, bL, aL = img.img.At(uLeft, j).RGBA()
		rR, gR, bR, aR = img.img.At(uRight+2*img.width, j).RGBA()
	} else {
		// SINGLE repeated
		rL, gL, bL, aL = img.img.At(uLeft, j).RGBA()
		rR, gR, bR, aR = img.img.At(uRight, j).RGBA()
	}

	left = unpremultiplyRGB(rL, gL, bL, aL)
	right = unpremultiplyRGB(rR, gR, bR, aR)
	return left, right, aL, aR
}

// helper function for spatial hashing
func spatialHash3D(x, y, z int) float64 {
	h := uint32(x*SPATIAL_PRIME_X) ^ uint32(y*SPATIAL_PRIME_Y) ^ uint32(z*SPATIAL_PRIME_Z)
	return float64(h%1000) / 1000.0
}

func getTopBottomColors(img InputImage, ii, z, d int) (top, bottom RGB, aT, aB uint32) {
	var vTop, vBottom int
	if d > 0 {
		vTop = int(float64(z+d) / float64(2*d) * float64(img.height-1))
		vBottom = int(float64(z+d) / float64(2*d) * float64(img.height-1))
	}

	var rT, gT, bT, rB, gB, bB uint32
	rT, gT, bT, aT = img.img.At(ii+4*img.width, vTop).RGBA()
	rB, gB, bB, aB = img.img.At(ii+5*img.width, vBottom).RGBA()

	top = unpremultiplyRGB(rT, gT, bT, aT)
	bottom = unpremultiplyRGB(rB, gB, bB, aB)
	return top, bottom, aT, aB
}

func populateVoxelsColumn(
	ctx context.Context,
	voxels *VoxelMap,
	img InputImage,
	i, j, ii, jj, d, edgeDistX int,
	colFront, colBack RGB,
	aF, aB uint32,
	avgColor RGB,
) {

	// for non-flat shapes, trim the depth at the silhouette edge using a
	// circular profile so the side view is rounded instead of a flat wall;
	// edgeDistX = horizontal distance to nearest transparent pixel.
	maxZ := d
	if img.settings.Shape != "flat" && d > 0 && edgeDistX < d {
		t := float64(edgeDistX) / float64(d)
		maxZ = max(1, int(math.Round(float64(d)*math.Sqrt(t*(2.0-t)))))
	}

	for z := -maxZ; z <= maxZ; z++ {

		if (z+maxZ)%64 == 0 && ctx.Err() != nil {
			return
		}

		// at the silhouette edge, randomly skip voxels at certain
		// z-levels so that different depths expose different x-positions.
		// this is basically done to create an organic and natural voxelization of the
		// side borders, so it doesn't look like an inflated sandwich lol
		if img.settings.Shape != "flat" && img.mode != QUAD && img.mode != SIX_SIDED && edgeDistX > 0 && edgeDistX <= 3 {
			skipProb := 0.0
			switch edgeDistX {
			case 1:
				skipProb = 0.25 // 25% skip
			case 2:
				skipProb = 0.10 // 10% skip
			case 3:
				skipProb = 0.05 // 5% skip
			}
			/*
				we just use a simple spatial hasher instead of stateful randomizer for speed and avoiding sequence issues
				whilst also making the skipping process deterministic so the user doesn't get different results on
				different generations; more info:
						[1] https://carmencincotti.com/2022-10-31/spatial-hash-maps-part-one/
						[2] https://en.wikipedia.org/wiki/Geometric_hashing
			*/
			if spatialHash3D(i, j, z+maxZ+1) < skipProb {
				continue
			}
		}

		var v Voxel
		v.IsQuad = img.mode == QUAD
		v.IsSixSided = img.mode == SIX_SIDED

		if z >= 0 {
			v.Color = colFront
		} else {
			v.Color = colBack
		}

		// side colors: QUAD mode uses dedicated side textures.
		// SINGLE mode with Repeated uses the front texture mapped across the depth ONLY for flat shapes.
		// otherwise, extend the edge color.
		var aL, aR uint32
		if img.mode == QUAD || img.mode == SIX_SIDED || (img.mode == SINGLE && img.settings.Repeated && img.settings.Shape == "flat") {
			v.LeftColor, v.RightColor, aL, aR = getSideColors(img, z, maxZ, jj)
		} else {
			v.LeftColor = colFront
			v.RightColor = colFront
			aL = 0xFFFFFFFF
			aR = 0xFFFFFFFF
		}

		if img.mode == QUAD || img.mode == SIX_SIDED {
			// quad and six-sided mode exception; if either side sprite is transparent at this depth, the voxel shouldn't exist.
			if aL == 0 || aR == 0 {
				continue
			}
		}

		if img.mode == SIX_SIDED {
			var aT, aBot uint32
			v.TopColor, v.BottomColor, aT, aBot = getTopBottomColors(img, ii, z, maxZ)
			if aT == 0 || aBot == 0 {
				continue
			}
		}

		if img.mode == SINGLE {
			v.OverrideRear = true
			if img.settings.Repeated {
				v.RearColor = colFront
			} else {
				v.RearColor = avgColor
			}
		}

		if z >= 0 && aF != 0 {
			voxels.Set(Vector3{i, -j, z}, v)
		}
		if z < 0 && aB != 0 {
			voxels.Set(Vector3{i, -j, z}, v)
		}
	}
}

// computeEdgeDistX returns, for every pixel, the horizontal distance to the
// nearest transparent pixel in the same row (x-direction only). Two passes
// per row (left→right, right→left) give the min of both sides.
func computeEdgeDistX(img InputImage) [][]int {
	edgeDist := make([][]int, img.width)
	for i := range img.width {
		edgeDist[i] = make([]int, img.height)
	}

	offsetX := 0
	if img.mode == QUAD || img.mode == SIX_SIDED {
		offsetX = img.width
	}

	for j := range img.height {
		// left → right
		dist := 0
		for i := 0; i < img.width; i++ {
			_, _, _, a := img.img.At(i+offsetX, j).RGBA()
			if a == 0 {
				dist = 0
			} else {
				dist++
				edgeDist[i][j] = dist
			}
		}
		// right → left
		dist = 0
		for i := img.width - 1; i >= 0; i-- {
			_, _, _, a := img.img.At(i+offsetX, j).RGBA()
			if a == 0 {
				dist = 0
			} else {
				dist++
				if dist < edgeDist[i][j] {
					edgeDist[i][j] = dist
				}
			}
		}
	}
	return edgeDist
}

func generate3DModel(ctx context.Context, inpImage InputImage, depths *[][]int) (*VoxelMap, error) {
	var avgColor RGB
	if inpImage.mode == SINGLE && !inpImage.settings.Repeated {
		avgColor = computeAverageColor(inpImage)
	}

	var edgeDistX [][]int
	if inpImage.settings.Shape != "flat" {
		edgeDistX = computeEdgeDistX(inpImage)
	}

	// "VoxelScale" controls global voxel size
	// 1.0 means 1 pixel = 1 voxel.
	scale := inpImage.settings.VoxelScale
	if scale < 1.0 {
		scale = 1.0
	}

	outW := int(math.Ceil(float64(inpImage.width) / scale))
	outH := int(math.Ceil(float64(inpImage.height) / scale))

	voxels := NewVoxelMap(outW)

	pool := NewWorkerPool(ctx, 0)
	for oi := 0; oi < outW; oi++ {
		colOI := oi
		pool.Submit(func() {
			processGeneratorColumn(ctx, colOI, outH, scale, inpImage, depths, edgeDistX, avgColor, voxels)
		})
	}
	pool.Wait()

	if ctx.Err() != nil {
		return nil, ctx.Err()
	}

	return voxels, nil
}

func processGeneratorColumn(
	ctx context.Context,
	colOI, outH int,
	scale float64,
	inpImage InputImage,
	depths *[][]int,
	edgeDistX [][]int,
	avgColor RGB,
	voxels *VoxelMap,
) {
	for oj := 0; oj < outH; oj++ {
		// periodic cancellation check inside inner loop
		if oj%64 == 0 && ctx.Err() != nil {
			return
		}

		ii := int(float64(colOI) * scale)
		jj := int(float64(oj) * scale)

		if ii >= inpImage.width {
			ii = inpImage.width - 1
		}
		if jj >= inpImage.height {
			jj = inpImage.height - 1
		}

		colFront, colBack, aF, aB := getFrontBackColors(inpImage, ii, jj)

		if aF == 0 && aB == 0 {
			continue
		}

		// note: d and edX only need to be overriden here for rounded-shape selection
		d := max(1, int(math.Round(inpImage.settings.FlatDepth/scale)))
		edx := 0

		if depths != nil {
			d = max(1, int(math.Round(float64((*depths)[ii][jj])/scale)))
		}
		if edgeDistX != nil {
			edx = max(1, int(math.Round(float64(edgeDistX[ii][jj])/scale)))
		}

		populateVoxelsColumn(ctx, voxels, inpImage, colOI, oj, ii, jj, d, edx, colFront, colBack, aF, aB, avgColor)
	}
}

func unpremultiplyRGB(r, g, b, a uint32) RGB {
	if a == 0 {
		return RGB{}
	}
	fa := float64(a)
	return RGB{
		r: uint8(math.Round(float64(r) / fa * 255.0)),
		g: uint8(math.Round(float64(g) / fa * 255.0)),
		b: uint8(math.Round(float64(b) / fa * 255.0)),
	}
}
