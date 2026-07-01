package backend

import (
	"fmt"
	"math"
	"os"
	"pix2dTo3dApp/backend/logging"
)



// helper to write a face to the .obj file, returns the updated; vertex index
func writeFaceToObj(objFile *os.File, settings Settings, vIdx int, v1, v2, v3, v4 [3]float64, col RGB) int {

	z1 := v1[2] * settings.DepthScale
	z2 := v2[2] * settings.DepthScale
	z3 := v3[2] * settings.DepthScale
	z4 := v4[2] * settings.DepthScale

	// write 4 vertices with vertex colors (supported by Blender)
	fmt.Fprintf(objFile, "v %.3f %.3f %.3f %.3f %.3f %.3f\n", v1[0], v1[1], z1, col.r, col.g, col.b)
	fmt.Fprintf(objFile, "v %.3f %.3f %.3f %.3f %.3f %.3f\n", v2[0], v2[1], z2, col.r, col.g, col.b)
	fmt.Fprintf(objFile, "v %.3f %.3f %.3f %.3f %.3f %.3f\n", v3[0], v3[1], z3, col.r, col.g, col.b)
	fmt.Fprintf(objFile, "v %.3f %.3f %.3f %.3f %.3f %.3f\n", v4[0], v4[1], z4, col.r, col.g, col.b)

	fmt.Fprintf(objFile, "f %d %d %d %d\n", vIdx, vIdx+1, vIdx+2, vIdx+3)

	return vIdx + 4
}

func writeVoxels(voxels *map[Vector3]Voxel, settings Settings, outFile *string) error {
	objFile, err := os.Create(*outFile)
	if err != nil {
		logging.ERROR(fmt.Sprintf("Failed to create %v. Err: %v", *outFile, err))
		return err
	}

	defer objFile.Close()

	vIdx := 1

	// direction vectors for 6 faces of a cube
	dirs := []Vector3{
		{1, 0, 0}, {-1, 0, 0},
		{0, 1, 0}, {0, -1, 0},
		{0, 0, 1}, {0, 0, -1},
	}

	for pos, col := range *voxels {
		x, y, z := float64(pos.x), float64(pos.y), float64(pos.z)

		for _, d := range dirs {
			if _, exists := (*voxels)[Vector3{pos.x + d.x, pos.y + d.y, pos.z + d.z}]; exists {
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
			if col.IsQuad {
				if d.x == -1 {
					faceColor = col.LeftColor
				} else if d.x == 1 {
					faceColor = col.RightColor
				} else {
					faceColor = col.Color
				}
			} else {
				faceColor = col.Color
			}

			if col.OverrideRear && d.z == -1 {
				faceColor = col.RearColor
			}

			vIdx = writeFaceToObj(
				objFile,
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

	return nil
}

func computeAverageColor(img InputImage) RGB {
	var sumR, sumG, sumB, count float64
	for i := range img.width {
		for j := range img.height {
			r, g, b, a := img.img.At(i, j).RGBA()
			if a > 0 {
				lin := unpremultiplyRGB(r, g, b, a, img.settings)
				sumR += lin.r
				sumG += lin.g
				sumB += lin.b
				count++
			}
		}
	}
	if count > 0 {
		return RGB{r: sumR / count, g: sumG / count, b: sumB / count}
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
		colFront = unpremultiplyRGB(rF, gF, bF, aF, img.settings)
	}
	if aB > 0 {
		colBack = unpremultiplyRGB(rB, gB, bB, aB, img.settings)
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

	left = unpremultiplyRGB(rL, gL, bL, aL, img.settings)
	right = unpremultiplyRGB(rR, gR, bR, aR, img.settings)
	return left, right, aL, aR
}

func populateVoxelsColumn(voxels *map[Vector3]Voxel, img InputImage, i, j, jj, d, edgeDistX int, colFront, colBack RGB, aF, aB uint32, avgColor RGB) {

	// For non-flat shapes, trim the depth at the silhouette edge using a
	// circular profile so the side view is rounded instead of a flat wall.
	// edgeDistX = horizontal distance to nearest transparent pixel.
	maxZ := d
	if img.settings.Shape != "flat" && d > 0 && edgeDistX < d {
		t := float64(edgeDistX) / float64(d)
		maxZ = max(1, int(math.Round(float64(d)*math.Sqrt(t*(2.0-t)))))
	}

	for z := -maxZ; z <= maxZ; z++ {

		// At the silhouette edge, randomly skip voxels at certain
		// z-levels so that different depths expose different x-positions.
		// This creates organic stairstepping when viewed from the side.
		if img.settings.Shape != "flat" && img.mode != QUAD && edgeDistX <= 3 && edgeDistX > 0 {
			h := (uint32(i*73856093) ^ uint32(j*19349669) ^ uint32((z+maxZ+1)*83492791)) % 1000
			var threshold uint32
			switch edgeDistX {
			case 1:
				threshold = 250 // 25% skip
			case 2:
				threshold = 100 // 10% skip
			case 3:
				threshold = 50 // 5% skip
			}
			if h < threshold {
				continue
			}
		}

		var v Voxel
		v.IsQuad = true

		// Front/back color based on depth sign
		if z >= 0 {
			v.Color = colFront
		} else {
			v.Color = colBack
		}

		// Side colors: QUAD mode uses dedicated side textures.
		// SINGLE mode with Repeated uses the front texture mapped across the depth ONLY for flat shapes.
		// Otherwise, extend the edge color.
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
			// In QUAD mode, the side sprites dictate the depth silhouette!
			// If either side sprite is transparent at this depth, the voxel shouldn't exist.
			if aL == 0 || aR == 0 {
				continue
			}
		}

		// Preserve existing rear-override behavior for SINGLE mode
		if img.mode == SINGLE {
			v.OverrideRear = true
			if img.settings.Repeated {
				v.RearColor = colFront
			} else {
				v.RearColor = avgColor
			}
		}

		if z >= 0 && aF != 0 {
			(*voxels)[Vector3{i, -j, z}] = v
		}
		if z < 0 && aB != 0 {
			(*voxels)[Vector3{i, -j, z}] = v
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

func generate3DModel(inpImage InputImage, depths *[][]int, outFile *string) error {
	voxels := make(map[Vector3]Voxel)

	var avgColor RGB
	if inpImage.mode == SINGLE && !inpImage.settings.Repeated {
		avgColor = computeAverageColor(inpImage)
	}

	// Pre-compute horizontal edge distances for side rounding.
	edgeDistX := computeEdgeDistX(inpImage)

	// VoxelScale controls global voxel size: scale down the image
	// by this factor. 1.0 means 1 pixel = 1 voxel.
	scale := inpImage.settings.VoxelScale
	if scale < 1.0 {
		scale = 1.0
	}

	outW := int(math.Ceil(float64(inpImage.width) / scale))
	outH := int(math.Ceil(float64(inpImage.height) / scale))

	for oi := 0; oi < outW; oi++ {
		for oj := 0; oj < outH; oj++ {
			ii := int(float64(oi) * scale)
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

			d := max(1, int(math.Round(float64((*depths)[ii][jj])/scale)))
			edx := max(1, int(math.Round(float64(edgeDistX[ii][jj])/scale)))

			populateVoxelsColumn(&voxels, inpImage, oi, oj, jj, d, edx, colFront, colBack, aF, aB, avgColor)
		}
	}

	logging.INFO("Generating mesh ...\n")

	err := writeVoxels(&voxels, inpImage.settings, outFile)
	if err != nil {
		return err
	}

	logging.INFO(fmt.Sprintf("Done! Saved as %s\n", *outFile))

	return nil
}

func unpremultiplyRGB(r, g, b, a uint32, settings Settings) RGB {
	if a == 0 {
		return RGB{}
	}
	fa := float64(a)
	return RGB{
		r: float64(r) / fa,
		g: float64(g) / fa,
		b: float64(b) / fa,
	}
}
