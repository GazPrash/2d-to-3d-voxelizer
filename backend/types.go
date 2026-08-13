package backend

import "image"

type Vector3 struct{ x, y, z int }

type RGB struct {
	r, g, b uint8
}

type colorBox struct {
	colors []RGB
	min    RGB
	max    RGB
}

type Mode int

const (
	SINGLE Mode = iota + 1
	DUAL
	QUAD
	SIX_SIDED
)

type Vertex struct{ x, y, z float64 }

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
	VoxelScale           float64 `json:"voxelScale"`
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

type EditAction struct {
	Type  string `json:"type"` // "erase" or "paint"
	Id    string `json:"id"`
	X     int    `json:"x"`
	Y     int    `json:"y"`
	Z     int    `json:"z"`
	Color string `json:"color"`
}
