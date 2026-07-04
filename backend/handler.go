package backend

import "log"

func ConvertTo3D(base64Image string, settings Settings, outFile string) error {

	inpImage, err := parseImage(base64Image, settings)
	if err != nil {
		log.Printf("Failed to parse the input image; Err: {%v}", err)
		return err
	}

	depths := DepthComputation(*inpImage)

	err = generate3DModel(*inpImage, depths, &outFile)
	if err != nil {
		log.Printf("Failed to generate the model; Err: {%v}", err)
		return err
	}
	return nil

}
