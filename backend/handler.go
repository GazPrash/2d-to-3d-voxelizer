package backend

import ()

func ConvertTo3D(base64Image string, settings Settings, outFile string) error {

	inpImage, err := parseImage(base64Image, settings)
	if err != nil {
		return err
	}

	depths := DepthComputation(*inpImage)

	err = generate3DModel(*inpImage, depths, &outFile)
	if err != nil {
		return err
	}
	return nil

}
