package main

import (
	"context"
	"os"
	"path/filepath"
	"pix2dTo3dApp/backend"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx context.Context
}

type FrontendSettings struct {
	Mode                 string  `json:"mode"`
	Repeated             bool    `json:"repeated"`
	Shape                string  `json:"shape"`
	BiasedScalingEnabled bool    `json:"biasedScalingEnabled"`
	BiasedScaleTop       float64 `json:"biasedScaleTop"`
	BiasedScaleMiddle    float64 `json:"biasedScaleMiddle"`
	BiasedScaleBottom    float64 `json:"biasedScaleBottom"`
	DepthScale           float64 `json:"depthScale"`
	FlatDepth            float64 `json:"flatDepth"`
	VoxelScale           float64 `json:"voxelScale"`
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) ProcessImage(base64ImageData string, frontendSettings FrontendSettings) (string, error) {
	settings := backend.Settings{
		Layout:               frontendSettings.Mode,
		Repeated:             frontendSettings.Repeated,
		Shape:                frontendSettings.Shape,
		BiasedScalingEnabled: frontendSettings.BiasedScalingEnabled,
		BiasedScaleTop:       frontendSettings.BiasedScaleTop,
		BiasedScaleMiddle:    frontendSettings.BiasedScaleMiddle,
		BiasedScaleBottom:    frontendSettings.BiasedScaleBottom,
		DepthScale:           frontendSettings.DepthScale,
		FlatDepth:            frontendSettings.FlatDepth,
		VoxelScale:           frontendSettings.VoxelScale,
	}

	tempFile := filepath.Join(os.TempDir(), "pix2d_out.obj")
	err := backend.ConvertTo3D(base64ImageData, settings, tempFile)
	if err != nil {
		return "", err
	}

	objData, err := os.ReadFile(tempFile)
	if err != nil {
		return "", err
	}

	// Remove the temporary file after reading it
	os.Remove(tempFile)

	return string(objData), nil
}

func (a *App) SaveModel(objContent string) (string, error) {
	filePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save 3D Model",
		DefaultFilename: "model.obj",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Wavefront OBJ (*.obj)",
				Pattern:     "*.obj",
			},
		},
	})
	if err != nil {
		return "", err
	}
	if filePath == "" {
		return "", nil // User cancelled
	}

	err = os.WriteFile(filePath, []byte(objContent), 0644)
	if err != nil {
		return "", err
	}

	return filePath, nil
}
