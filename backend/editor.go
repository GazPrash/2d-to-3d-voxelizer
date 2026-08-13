package backend

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
)

func hexToRGB(hex string) RGB {
	hex = strings.TrimPrefix(hex, "#")
	if len(hex) == 6 {
		r, _ := strconv.ParseUint(hex[0:2], 16, 8)
		g, _ := strconv.ParseUint(hex[2:4], 16, 8)
		b, _ := strconv.ParseUint(hex[4:6], 16, 8)
		return RGB{uint8(r), uint8(g), uint8(b)}
	}
	return RGB{}
}

func findClosestColor(target RGB, palette []RGB) RGB {
	var best RGB
	bestDist := math.MaxFloat64

	tr, tg, tb := float64(target.r), float64(target.g), float64(target.b)

	for _, p := range palette {
		pr, pg, pb := float64(p.r), float64(p.g), float64(p.b)
		dr := tr - pr
		dg := tg - pg
		db := tb - pb
		dist := dr*dr + dg*dg + db*db
		if dist < bestDist {
			bestDist = dist
			best = p
		}
	}
	return best
}

func writeFaceToObj(buf *strings.Builder, settings Settings, vIdx int, v1, v2, v3, v4 [3]float64, col RGB) int {
	z1 := v1[2] * settings.DepthScale
	z2 := v2[2] * settings.DepthScale
	z3 := v3[2] * settings.DepthScale
	z4 := v4[2] * settings.DepthScale

	buf.WriteString(fmt.Sprintf("v %.3f %.3f %.3f\n", v1[0], v1[1], z1))
	buf.WriteString(fmt.Sprintf("v %.3f %.3f %.3f\n", v2[0], v2[1], z2))
	buf.WriteString(fmt.Sprintf("v %.3f %.3f %.3f\n", v3[0], v3[1], z3))
	buf.WriteString(fmt.Sprintf("v %.3f %.3f %.3f\n", v4[0], v4[1], z4))

	buf.WriteString(fmt.Sprintf("usemtl mat_%d_%d_%d\n", col.r, col.g, col.b))
	buf.WriteString(fmt.Sprintf("f %d %d %d %d\n", vIdx, vIdx+1, vIdx+2, vIdx+3))

	return vIdx + 4
}

// GenerateMesh converts a VoxelMap into Wavefront OBJ and MTL strings in-memory.
func GenerateMesh(ctx context.Context, voxels *VoxelMap, settings Settings, cullFaces bool) (string, string, error) {
	var objBuf strings.Builder
	var mtlBuf strings.Builder

	objBuf.WriteString("mtllib placeholder.mtl\n")

	materials := make(map[RGB]bool)

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
			return "", "", ctx.Err()
		}
		for pos, col := range voxels.shards[i].m {
			voxelCount++
			if voxelCount%4096 == 0 && ctx.Err() != nil {
				return "", "", ctx.Err()
			}

			x, y, z := float64(pos.x), float64(pos.y), float64(pos.z)

			for _, d := range dirs {
				if cullFaces {
					if _, exists := voxels.Get(Vector3{pos.x + d.x, pos.y + d.y, pos.z + d.z}); exists {
						continue
					}
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
				case (col.IsQuad || col.IsSixSided) && d.x == -1:
					faceColor = col.LeftColor
				case (col.IsQuad || col.IsSixSided) && d.x == 1:
					faceColor = col.RightColor
				case col.IsSixSided && d.y == 1:
					faceColor = col.TopColor
				case col.IsSixSided && d.y == -1:
					faceColor = col.BottomColor
				default:
					faceColor = col.Color
				}

				if col.OverrideRear && d.z == -1 {
					faceColor = col.RearColor
				}

				if !materials[faceColor] {
					materials[faceColor] = true
					cr := float64(faceColor.r) / 255.0
					cg := float64(faceColor.g) / 255.0
					cb := float64(faceColor.b) / 255.0
					mtlBuf.WriteString(fmt.Sprintf("newmtl mat_%d_%d_%d\n", faceColor.r, faceColor.g, faceColor.b))
					mtlBuf.WriteString(fmt.Sprintf("Kd %.5f %.5f %.5f\n\n", cr, cg, cb))
				}

				vIdx = writeFaceToObj(
					&objBuf,
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

	return objBuf.String(), mtlBuf.String(), nil
}

func ApplyEditsToVoxelMap(voxels *VoxelMap, edits []EditAction) error {
	for _, edit := range edits {
		pos := Vector3{int(edit.X), int(edit.Y), int(edit.Z)}

		switch edit.Type {
		case "erase":
			voxels.Delete(pos)
		case "paint":
			colRGB := hexToRGB(edit.Color)
			newCol := Voxel{
				Color:        colRGB,
				LeftColor:    colRGB,
				RightColor:   colRGB,
				TopColor:     colRGB,
				BottomColor:  colRGB,
				RearColor:    colRGB,
				IsQuad:       false,
				IsSixSided:   false,
				OverrideRear: false,
			}
			voxels.Set(pos, newCol)
		}
	}
	return nil
}
