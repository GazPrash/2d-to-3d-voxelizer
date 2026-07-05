package backend

import (
	"context"
	"log"
)

func ConvertTo3D(ctx context.Context, base64Image string, settings Settings, outFile string) error {

	inpImage, err := parseImage(base64Image, settings)
	if err != nil {
		log.Printf("Failed to parse the input image; Err: {%v}", err)
		return err
	}

	if ctx.Err() != nil {
		return ctx.Err()
	}

	depths := DepthComputation(ctx, *inpImage)

	if ctx.Err() != nil {
		return ctx.Err()
	}

	err = generate3DModel(ctx, *inpImage, depths, &outFile)
	if err != nil {
		log.Printf("Failed to generate the model; Err: {%v}", err)
		return err
	}
	return nil
}
