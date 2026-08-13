package backend

import (
	"fmt"
	"image"
	"image/color"
	"sort"
)

func (b *colorBox) updateBounds() {
	if len(b.colors) == 0 {
		return
	}
	b.min = b.colors[0]
	b.max = b.colors[0]
	for _, c := range b.colors {
		if c.r < b.min.r {
			b.min.r = c.r
		}
		if c.r > b.max.r {
			b.max.r = c.r
		}
		if c.g < b.min.g {
			b.min.g = c.g
		}
		if c.g > b.max.g {
			b.max.g = c.g
		}
		if c.b < b.min.b {
			b.min.b = c.b
		}
		if c.b > b.max.b {
			b.max.b = c.b
		}
	}
}

func (b *colorBox) longestAxis() int {
	rRange := b.max.r - b.min.r
	gRange := b.max.g - b.min.g
	bRange := b.max.b - b.min.b
	if rRange >= gRange && rRange >= bRange {
		return 0
	} else if gRange >= rRange && gRange >= bRange {
		return 1
	}
	return 2
}

func (b *colorBox) split() (*colorBox, *colorBox) {
	axis := b.longestAxis()
	sort.Slice(b.colors, func(i, j int) bool {
		switch axis {
		case 0:
			return b.colors[i].r < b.colors[j].r
		case 1:
			return b.colors[i].g < b.colors[j].g
		default:
			return b.colors[i].b < b.colors[j].b
		}
	})
	mid := len(b.colors) / 2
	b1 := &colorBox{colors: b.colors[:mid]}
	b2 := &colorBox{colors: b.colors[mid:]}
	b1.updateBounds()
	b2.updateBounds()
	return b1, b2
}

func (b *colorBox) average() RGB {
	if len(b.colors) == 0 {
		return RGB{}
	}
	var sumR, sumG, sumB int
	for _, c := range b.colors {
		sumR += int(c.r)
		sumG += int(c.g)
		sumB += int(c.b)
	}
	count := len(b.colors)
	return RGB{
		r: uint8(sumR / count),
		g: uint8(sumG / count),
		b: uint8(sumB / count),
	}
}

func ExtractPalette(img image.Image) (map[RGB]struct{}, []RGB) {
	bounds := img.Bounds()
	unique := make(map[RGB]struct{})
	var colors []RGB
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, a := img.At(x, y).RGBA()
			if a > 0 {
				rgb := unpremultiplyRGB(r, g, b, a)
				if _, exists := unique[rgb]; !exists {
					unique[rgb] = struct{}{}
					colors = append(colors, rgb)
				}
			}
		}
	}
	return unique, colors
}

func QuantizeImage(img image.Image, maxColors int) (image.Image, []string) {
	unique, colors := ExtractPalette(img)
	if len(colors) <= maxColors {
		return img, rgbToHexArray(colors)
	}

	/*
		In the case where our image has more than the max number of colors allowed in the color pallete (in Editor mode)
		we now use the median cut based algorithm accordingly:

			[1] the below code groups all colors into a single "box" and repeatedly splits the largest box along its
					longest color axis (Red, Green, or Blue) until it has maxColors number of boxes.
			[2] The average color of each box becomes a color in the new, reduced palette.
			[3] It then creates and returns a new image where every original pixel is replaced by
					the closest color from this new palette.
					(It also returns the new palette as an array of hex strings)

		This idea is inspired/taken from the Median Cut algorithm:
			[1] https://en.wikipedia.org/wiki/Median_cut
			[2] https://web.cs.wpi.edu/~matt/courses/cs563/talks/color_quant/CQmediancut.html (simple explaination)

	*/

	boxes := []*colorBox{{colors: colors}}
	boxes[0].updateBounds()

	for len(boxes) < maxColors {
		var maxBoxIdx int
		maxBoxSize := -1
		for i, b := range boxes {
			if len(b.colors) > maxBoxSize {
				maxBoxSize = len(b.colors)
				maxBoxIdx = i
			}
		}

		if maxBoxSize <= 1 {
			break
		}

		b1, b2 := boxes[maxBoxIdx].split()
		boxes[maxBoxIdx] = b1
		boxes = append(boxes, b2)
	}

	palette := make([]RGB, len(boxes))
	for i, b := range boxes {
		palette[i] = b.average()
	}

	colorMap := make(map[RGB]RGB)
	for rgb := range unique {
		colorMap[rgb] = findClosestColor(rgb, palette)
	}

	bounds := img.Bounds()
	newImg := image.NewRGBA(bounds)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, a := img.At(x, y).RGBA()
			if a > 0 {
				rgb := unpremultiplyRGB(r, g, b, a)
				mapped := colorMap[rgb]
				// premultiply again since it's image.RGBA
				fa := float64(a) / 65535.0
				newImg.Set(x, y, color.RGBA{
					R: uint8(float64(mapped.r) * fa),
					G: uint8(float64(mapped.g) * fa),
					B: uint8(float64(mapped.b) * fa),
					A: uint8(a >> 8),
				})
			} else {
				newImg.Set(x, y, color.RGBA{0, 0, 0, 0})
			}
		}
	}

	return newImg, rgbToHexArray(palette)
}

func rgbToHexArray(colors []RGB) []string {
	hexes := make([]string, len(colors))
	for i, c := range colors {
		hexes[i] = fmt.Sprintf("#%02x%02x%02x", c.r, c.g, c.b)
	}
	return hexes
}
