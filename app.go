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
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"pix2dTo3dApp/backend"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type ModelOutput struct {
	ObjContent string   `json:"objContent"`
	MtlContent string   `json:"mtlContent"`
	VoxelCount int      `json:"voxelCount"`
	Palette    []string `json:"palette"`
}

type App struct {
	ctx    context.Context
	cancel context.CancelFunc
	mu     sync.Mutex

	currentVoxelMap *backend.VoxelMap
	currentSettings backend.Settings
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

func (a *App) ProcessImage(base64ImageData string, settings backend.Settings) (ModelOutput, error) {
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

	/*
		Currently due to the addition of the Editor mode, we are by default creating non-culled voxel maps
		from the input image. The voxel map future is depended on the following two cases:

			[1] If the total num of expected voxels are bound to be more than 50k, then we delete the voxel map immediately
					after creation (the subsequent GC cleanup happens async), and we do this because we are forced to
					create a non-culled voxel map, and even though we dont allow editing of the 3D model,
					we still allow generation and saving, so re-generating the voxel is a slightly better approach
					then letting the voxel map sit on the ram.

					In future we might switch to following impls:
						[A] Generate two different types of voxel maps (culled and non-culled faces) for our use case,
								and then generate meshes accordingly, should be able to keep both in memory.
								That would include implementing a dual behaviour within the GenerateMesh function to operate on
								both culled and non-culled voxel maps.
						[B] Save the generated voxel maps in some sort of format or data structure on storage and then re-load or re-read it
								instead of re-generating it. Process could be slower in HDDs will have to test.

			[2] If the numbero of voxels are expected to be less than the 50k limit, then we allow the voxel map to be retained in the memory
					whilst still following the 2GB ram cap, without any performance downsides,
					so editing and then switchin back to Viewer should be seamless.

	*/

	vmap, voxelCount, err := backend.ConvertTo3D(jobCtx, base64ImageData, settings)
	if err != nil {
		log.Printf("Failed to convert the input file; Err: %v", err)
		return ModelOutput{}, err
	}

	a.mu.Lock()
	a.currentVoxelMap = vmap
	a.currentSettings = settings
	a.mu.Unlock()

	objData, mtlData, err := backend.GenerateMesh(jobCtx, vmap, settings, true) // cullFaces=true
	if err != nil {
		log.Printf("Failed to generate mesh; Err: %v", err)
		return ModelOutput{}, err
	}

	if voxelCount > backend.MAX_EDITABLE_VOXELS {
		a.ClearEditorModel()
	}

	return ModelOutput{
		ObjContent: objData,
		MtlContent: mtlData,
		VoxelCount: voxelCount,
		Palette:    vmap.Palette,
	}, nil
}

func (a *App) GetEditorModel() (ModelOutput, error) {
	a.mu.Lock()
	vmap := a.currentVoxelMap
	settings := a.currentSettings
	a.mu.Unlock()

	if vmap == nil {
		return ModelOutput{}, fmt.Errorf("no model loaded")
	}

	objData, mtlData, err := backend.GenerateMesh(a.ctx, vmap, settings, false) // cullFaces=false
	if err != nil {
		return ModelOutput{}, err
	}

	return ModelOutput{
		ObjContent: objData,
		MtlContent: mtlData,
		VoxelCount: 0,
	}, nil
}

func (a *App) ClearEditorModel() {
	a.mu.Lock()
	if a.currentVoxelMap != nil {
		a.currentVoxelMap.Clear()
		a.currentVoxelMap = nil
	}
	a.mu.Unlock()

	go a.FreeMemory()
}

func (a *App) ApplyEdits(edits []backend.EditAction) (ModelOutput, error) {
	a.mu.Lock()
	vmap := a.currentVoxelMap
	settings := a.currentSettings
	a.mu.Unlock()

	if vmap == nil {
		return ModelOutput{}, fmt.Errorf("no model loaded")
	}

	err := backend.ApplyEditsToVoxelMap(vmap, edits)
	if err != nil {
		return ModelOutput{}, err
	}

	objData, mtlData, err := backend.GenerateMesh(a.ctx, vmap, settings, true) // cullFaces=true
	if err != nil {
		return ModelOutput{}, err
	}

	return ModelOutput{
		ObjContent: objData,
		MtlContent: mtlData,
		VoxelCount: 0,
	}, nil
}

func (a *App) SaveModel(objContent string, mtlContent string) (string, error) {
	filePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save 3D Model Archive",
		DefaultFilename: "model.zip",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Zip Archive (*.zip)",
				Pattern:     "*.zip",
			},
		},
	})
	if err != nil {
		return "", err
	}
	if filePath == "" {
		return "", nil
	}

	baseName := strings.TrimSuffix(filepath.Base(filePath), ".zip")
	if baseName == "" {
		baseName = "model"
	}
	objFileName := baseName + ".obj"
	mtlFileName := baseName + ".mtl"

	finalObjContent := strings.Replace(objContent, "mtllib placeholder.mtl", "mtllib "+mtlFileName, 1)

	var buf bytes.Buffer
	zipWriter := zip.NewWriter(&buf)

	objWriter, err := zipWriter.Create(objFileName)
	if err != nil {
		return "", err
	}
	if _, err := objWriter.Write([]byte(finalObjContent)); err != nil {
		return "", err
	}

	mtlWriter, err := zipWriter.Create(mtlFileName)
	if err != nil {
		return "", err
	}
	if _, err := mtlWriter.Write([]byte(mtlContent)); err != nil {
		return "", err
	}

	if err := zipWriter.Close(); err != nil {
		return "", err
	}

	err = os.WriteFile(filePath, buf.Bytes(), 0644)
	if err != nil {
		return "", err
	}

	return filePath, nil
}

func (a *App) ReadLocalFileBase64(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

func (a *App) SelectImage() (string, error) {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Image",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Images (*.png;*.jpg;*.jpeg)",
				Pattern:     "*.png;*.jpg;*.jpeg",
			},
		},
	})
	if err != nil {
		return "", err
	}
	return filePath, nil
}
