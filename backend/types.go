package backend

import "image"

type Vector3 struct{ x, y, z int }

type RGB struct {
	r, g, b uint8
}

type Mode int

const (
	SINGLE Mode = iota + 1
	DUAL
	QUAD
	SIX_SIDED
)

type Voxel struct {
	Color        RGB
	LeftColor    RGB
	RightColor   RGB
	RearColor    RGB
	TopColor     RGB
	BottomColor  RGB
	IsQuad       bool
	IsSixSided   bool
	OverrideRear bool
}

type Settings struct {
	Layout               string  `json:"mode"`
	Repeated             bool    `json:"repeated"`
	Shape                string  `json:"shape"`
	BiasedScalingEnabled bool    `json:"biasedScalingEnabled"`
	BiasedScaleTop       float64 `json:"biasedScaleTop"`
	BiasedScaleMiddle    float64 `json:"biasedScaleMiddle"`
	BiasedScaleBottom    float64 `json:"biasedScaleBottom"`
	DepthScale           float64 `json:"depthScale"`
	FlatDepth            float64 `json:"flatDepth"`
	VoxelScale           float64 `json:"voxelScale"` // scale factor for global voxel size (1.0 to 3.0)
	CapsulePower         float64 `json:"capsulePower"`
	BaseThickness        float64 `json:"baseThickness"`
}

type InputImage struct {
	img      image.Image
	mode     Mode
	settings Settings
	bounds   image.Rectangle
	width    int
	height   int
}
