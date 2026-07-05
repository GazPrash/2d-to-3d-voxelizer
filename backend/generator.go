package backend

import (
	"bufio"
	"context"
	"fmt"
	"math"
	"os"
	"pix2dTo3dApp/backend/logging"
)

/*
	The aim of this service is to take an input image, user settings, and a 3d depth matrix
	and then prepare a 3D obj model out of it based on the user chosen settings
*/

type VoxelMap struct {
	shards []voxelShard
}

type voxelShard struct {
	m map[Vector3]Voxel
}

func NewVoxelMap(width int) *VoxelMap {
	vm := &VoxelMap{
		shards: make([]voxelShard, width),
	}

	for i := range width {
		vm.shards[i].m = make(map[Vector3]Voxel, 1024)
	}
	return vm
}

func (vm *VoxelMap) Get(v Vector3) (Voxel, bool) {
	if v.x < 0 || v.x >= len(vm.shards) {
		return Voxel{}, false
	}
	val, ok := vm.shards[v.x].m[v]
	return val, ok
}

func (vm *VoxelMap) Set(v Vector3, vox Voxel) {
	if v.x >= 0 && v.x < len(vm.shards) {
		vm.shards[v.x].m[v] = vox
	}
}

// Clear drops all voxel data so the GC can reclaim the memory.
func (vm *VoxelMap) Clear() {
	for i := range len(vm.shards) {
		vm.shards[i].m = nil
	}
}

// helper to write a face to the .obj file;
// caller must provide the current vertexIndex, we dont keep a global track
// func returns the vidx, upto which the vertex has been updated + 1, caller must recv this to progress
func writeFaceToObj(buf *bufio.Writer, settings Settings, vIdx int, v1, v2, v3, v4 [3]float64, col RGB) int {

	z1 := v1[2] * settings.DepthScale
	z2 := v2[2] * settings.DepthScale
	z3 := v3[2] * settings.DepthScale
	z4 := v4[2] * settings.DepthScale

	cr := float64(col.r) / 255.0
	cg := float64(col.g) / 255.0
	cb := float64(col.b) / 255.0

	// 4 vertices .obj format
	fmt.Fprintf(buf, "v %.3f %.3f %.3f %.3f %.3f %.3f\n", v1[0], v1[1], z1, cr, cg, cb)
	fmt.Fprintf(buf, "v %.3f %.3f %.3f %.3f %.3f %.3f\n", v2[0], v2[1], z2, cr, cg, cb)
	fmt.Fprintf(buf, "v %.3f %.3f %.3f %.3f %.3f %.3f\n", v3[0], v3[1], z3, cr, cg, cb)
	fmt.Fprintf(buf, "v %.3f %.3f %.3f %.3f %.3f %.3f\n", v4[0], v4[1], z4, cr, cg, cb)

	fmt.Fprintf(buf, "f %d %d %d %d\n", vIdx, vIdx+1, vIdx+2, vIdx+3)

	return vIdx + 4
}

func writeVoxels(ctx context.Context, voxels *VoxelMap, settings Settings, outFile *string) error {
	objFile, err := os.Create(*outFile)
	if err != nil {
		logging.ERROR(fmt.Sprintf("Failed to create %v. Err: %v", *outFile, err))
		return err
	}

	defer objFile.Close()

	// 1MB buffer
	buf := bufio.NewWriterSize(objFile, 1024*1024)
	defer buf.Flush()

	vIdx := 1

	// direction vectors for 6 faces of a cube
	dirs := []Vector3{
		{1, 0, 0}, {-1, 0, 0},
		{0, 1, 0}, {0, -1, 0},
		{0, 0, 1}, {0, 0, -1},
	}

	voxelCount := 0
	for i := range len(voxels.shards) {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		for pos, col := range voxels.shards[i].m {

			voxelCount++
			if voxelCount%4096 == 0 && ctx.Err() != nil {
				return ctx.Err()
			}

			x, y, z := float64(pos.x), float64(pos.y), float64(pos.z)

			for _, d := range dirs {
				if _, exists := voxels.Get(Vector3{pos.x + d.x, pos.y + d.y, pos.z + d.z}); exists {
					continue
				}

				dx, dy, dz := float64(d.x), float64(d.y), float64(d.z)
				cx, cy, cz := x+dx*0.5, y+dy*0.5, z+dz*0.5
				var ux, uy, uz, vx, vy, vz float64
				switch {
				case d.x != 0:
					uy, vz = 0.5, dx*0.5
				case d.y != 0:
					uz, vx = 0.5, dy*0.5
				case d.z != 0:
					ux, vy = 0.5, dz*0.5
				}

				var faceColor RGB
				switch {
				case col.IsQuad && d.x == -1:
					faceColor = col.LeftColor
				case col.IsQuad && d.x == 1:
					faceColor = col.RightColor
				default:
					faceColor = col.Color
				}

				if col.OverrideRear && d.z == -1 {
					faceColor = col.RearColor
				}

				vIdx = writeFaceToObj(
					buf,
					settings,
					vIdx,
					[3]float64{cx - ux + vx, cy - uy + vy, cz - uz + vz},
					[3]float64{cx - ux - vx, cy - uy - vy, cz - uz - vz},
					[3]float64{cx + ux - vx, cy + uy - vy, cz + uz - vz},
					[3]float64{cx + ux + vx, cy + uy + vy, cz + uz + vz},
					faceColor,
				)
			}
		}
	}

	return nil
}

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

	case QUAD:
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

	if img.mode == QUAD {
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
	h := uint32(x*SpatialPrimeX) ^ uint32(y*SpatialPrimeY) ^ uint32(z*SpatialPrimeZ)
	return float64(h%1000) / 1000.0
}

func populateVoxelsColumn(
	ctx context.Context,
	voxels *VoxelMap,
	img InputImage,
	i, j, jj, d, edgeDistX int,
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
		if img.settings.Shape != "flat" && img.mode != QUAD && edgeDistX > 0 && edgeDistX <= 3 {
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
				more info:
				       [1] https://carmencincotti.com/2022-10-31/spatial-hash-maps-part-one/
						 [2] https://en.wikipedia.org/wiki/Geometric_hashing
			*/
			if spatialHash3D(i, j, z+maxZ+1) < skipProb {
				continue
			}
		}

		var v Voxel
		v.IsQuad = true

		if z >= 0 {
			v.Color = colFront
		} else {
			v.Color = colBack
		}

		// side colors: QUAD mode uses dedicated side textures.
		// SINGLE mode with Repeated uses the front texture mapped across the depth ONLY for flat shapes.
		// otherwise, extend the edge color.
		var aL, aR uint32
		if img.mode == QUAD || (img.mode == SINGLE && img.settings.Repeated && img.settings.Shape == "flat") {
			v.LeftColor, v.RightColor, aL, aR = getSideColors(img, z, maxZ, jj)
		} else {
			v.LeftColor = colFront
			v.RightColor = colFront
			aL = 0xFFFFFFFF
			aR = 0xFFFFFFFF
		}

		if img.mode == QUAD {
			// quad mode exception if either side sprite is transparent at this depth, the voxel shouldn't exist.
			if aL == 0 || aR == 0 {
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
	if img.mode == QUAD {
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

func generate3DModel(ctx context.Context, inpImage InputImage, depths *[][]int, outFile *string) error {
	var avgColor RGB
	if inpImage.mode == SINGLE && !inpImage.settings.Repeated {
		avgColor = computeAverageColor(inpImage)
	}

	edgeDistX := computeEdgeDistX(inpImage)

	// "VoxelScale" controls global voxel size: scale down the image
	// by this factor. 1.0 means 1 pixel = 1 voxel.
	scale := inpImage.settings.VoxelScale
	if scale < 1.0 {
		scale = 1.0
	}

	outW := int(math.Ceil(float64(inpImage.width) / scale))
	outH := int(math.Ceil(float64(inpImage.height) / scale))

	voxels := NewVoxelMap(outW)
	defer voxels.Clear()

	pool := NewWorkerPool(ctx, 0)
	for oi := 0; oi < outW; oi++ {
		colOI := oi
		pool.Submit(func() {
			processGeneratorColumn(ctx, colOI, outH, scale, inpImage, *depths, edgeDistX, avgColor, voxels)
		})
	}
	pool.Wait()

	if ctx.Err() != nil {
		return ctx.Err()
	}

	logging.INFO("Generating mesh ...\n")

	err := writeVoxels(ctx, voxels, inpImage.settings, outFile)
	if err != nil {
		return err
	}

	logging.INFO(fmt.Sprintf("Done! Saved as %s\n", *outFile))

	return nil
}

func processGeneratorColumn(
	ctx context.Context,
	colOI, outH int,
	scale float64,
	inpImage InputImage,
	depths [][]int,
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

		d := max(1, int(math.Round(float64(depths[ii][jj])/scale)))
		edx := max(1, int(math.Round(float64(edgeDistX[ii][jj])/scale)))

		populateVoxelsColumn(ctx, voxels, inpImage, colOI, oj, jj, d, edx, colFront, colBack, aF, aB, avgColor)
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
