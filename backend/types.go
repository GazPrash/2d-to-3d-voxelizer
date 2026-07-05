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
)

type Voxel struct {
	Color        RGB
	LeftColor    RGB
	RightColor   RGB
	RearColor    RGB
	IsQuad       bool
	OverrideRear bool
}

type Settings struct {
	Layout               string
	Repeated             bool
	Shape                string
	BiasedScalingEnabled bool
	BiasedScaleTop       float64
	BiasedScaleMiddle    float64
	BiasedScaleBottom    float64
	DepthScale           float64
	FlatDepth            float64
	VoxelScale           float64 // scale factor for global voxel size (1.0 to 3.0)
}

type InputImage struct {
	img      image.Image
	mode     Mode
	settings Settings
	bounds   image.Rectangle
	width    int
	height   int
}
