package backend

import (
	"context"
	"math"
	"pix2dTo3dApp/backend/logger"
	"runtime"
	"runtime/debug"
)

func EstimateVoxelCount(inpImage InputImage, depths *[][]int, scale float64) int {
	expectedVoxels := 0
	for i := 0; i < inpImage.width; i++ {
		for j := 0; j < inpImage.height; j++ {
			_, _, _, a := inpImage.img.At(i, j).RGBA()
			if a > 0 {
				d := max(1, int(math.Round(inpImage.settings.FlatDepth/scale)))
				if depths != nil {
					d = max(1, int(math.Round(float64((*depths)[i][j])/scale)))
				}
				expectedVoxels += (2 * d) + 1
			}
		}
	}
	return expectedVoxels
}

func ConvertTo3D(ctx context.Context, base64Image string, settings Settings) (*VoxelMap, int, error) {

	inpImage, err := parseImage(base64Image, settings)
	if err != nil {
		logger.Printf("Failed to parse the input image; Err: {%v}", err)
		return nil, 0, err
	}

	var palette []string
	if inpImage.width > MAX_COLORS || inpImage.height > MAX_COLORS {
		logger.Infof("Image > %dx%d, quantizing palette to %d colors", MAX_COLORS, MAX_COLORS, MAX_COLORS)
		inpImage.img, palette = QuantizeImage(inpImage.img, MAX_COLORS)
	} else {
		_, colors := ExtractPalette(inpImage.img)
		palette = rgbToHexArray(colors)
	}

	if ctx.Err() != nil {
		return nil, 0, ctx.Err()
	}

	depths := DepthComputation(ctx, *inpImage)

	if ctx.Err() != nil {
		return nil, 0, ctx.Err()
	}

	estimatedCount := EstimateVoxelCount(*inpImage, depths, settings.VoxelScale)

	vmap, err := generate3DModel(ctx, *inpImage, depths)
	if vmap != nil {
		vmap.Palette = palette
	}

	inpImage = nil
	depths = nil
	_ = inpImage
	_ = depths

	if err != nil {
		logger.Printf("Failed to generate the model; Err: {%v}", err)
	}

	return vmap, estimatedCount, err
}

func ForceGC() {
	runtime.GC()
	debug.FreeOSMemory()
}
