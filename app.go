/*
 *  ▄▄▄▄  ▄▄ ▄▄ ▄▄ ████▄ ▄▄▄▄ ██████ ▄▄▄  ████▄ ▄▄▄▄
 *  ██▄█▀ ██ ▀█▄█▀  ▄██▀ ██▀██  ██  ██▀██  ▄▄██ ██▀██
 *  ██    ██ ██ ██ ███▄▄ ████▀  ██  ▀███▀ ▄▄▄█▀ ████▀
 *      +-------+
 *     /       /|
 *    +-------+ |
 *    |       | +
 *    | 2D->3D|/
 *    +-------+
 */

package main

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"pix2dTo3dApp/backend"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx    context.Context
	cancel context.CancelFunc
	mu     sync.Mutex
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

func (a *App) CancelProcessing() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.cancel != nil {
		a.cancel()
		a.cancel = nil
	}
}

// FreeMemory forces Go's garbage collector to run and return memory to the OS.
// Called from the frontend when navigating away from the 3D viewer.
func (a *App) FreeMemory() {
	backend.ForceGC()
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

	a.mu.Lock()
	if a.cancel != nil {
		a.cancel()
	}
	var jobCtx context.Context
	jobCtx, a.cancel = context.WithCancel(a.ctx)
	a.mu.Unlock()

	defer func() {
		a.mu.Lock()
		if a.cancel != nil {
			a.cancel()
			a.cancel = nil
		}
		a.mu.Unlock()
	}()

	tempFile := filepath.Join(os.TempDir(), "pix2d_out_temp.obj")
	err := backend.ConvertTo3D(jobCtx, base64ImageData, settings, tempFile)
	if err != nil {
		log.Printf("Failed to convert the input file; Err: %v", err)
		return "", err
	}

	objData, err := os.ReadFile(tempFile)
	if err != nil {
		log.Printf("Failed to read the created object file; Err: %v", err)
		return "", err
	}
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
		// in case of cancellation by user
		return "", nil
	}

	err = os.WriteFile(filePath, []byte(objContent), 0644)
	if err != nil {
		return "", err
	}

	return filePath, nil
}
