# README

<img width="162" height="162" alt="Sprite-0010" src="https://github.com/user-attachments/assets/af006add-ab1d-4a90-9ab7-15a440e65336" />

<img width="384" height="256" alt="2D To 3D Voxelizer" src="https://github.com/user-attachments/assets/d0545047-9b01-49ad-b985-ace3beff14b8" />

<video src="https://github.com/user-attachments/assets/67908669-e253-4b2a-b792-5769ea251da1" controls autoplay loop muted style="max-width: 100%;"></video>

A simple tool that can be used to generate 3D voxel art based on a 2d pixel art sprite, or generate a fully 3d object
based on provided 4 or 6 sided pixel-art sprite sheet. The output can be saved as a .obj file which can be imported or used
with Blender, Unity, Godot or any other Game Engine or 3D Modelling software. Internally we use simple math algorithms 
to extend a 2D image into a 3D voxel grid without using any AI models so that your actual art is well preserved, but it also comes with 
a downside, which is this method may not be very useful for complicated pixel art styles with varying depths.

The tree art in the image and video was taken for the demo from here: https://graphscriptdev.itch.io/plant-trees?download

## Modes
<img width="618" height="611" alt="app_preview" src="https://github.com/user-attachments/assets/c1e864cd-f00c-4242-be31-d49e72670820" />

the app supports various generation modes based on the type of sprite input;

- **Single**: Generates a 3D voxel representation based on a single 2D sprite image.
- **Single + Repeated**: Uses a single sprite and repeats it along the 4 sides, and extrudes by a specified depth scale.
- **Dual**: Uses a dual-perspective sprite sheet [FRONT,BACK] to generate the 3D model.
- **Quad**: Generates a full 360-degree 3D object using a 4-sided sprite sheet, used in this order; [LEFT, FRONT, RIGHT, BACK].

### Using Quad Mode
To use the **Quad** mode, you must input a sprite sheet containing 4 directional perspectives. 
The sprite sheet must be laid out horizontally in the following specific order:
1. **Left Side**
2. **Front**
3. **Right Side**
4. **Back**

**Important:** The artwork must be properly centered within each of the 4 faces in the sprite sheet to ensure proper alignment and symmetry when generating the 3D model.
**Note**: You should use animation frame feature of aseprite or similar pixel art editors to generate a horizontal spread sheet, that would be easier to work with.

Example Quad Sprite Sheet:
![Quad Sprite Sheet Example](demos/sci-Sheet-export.png)

## Depth Scaling
Depth scaling controls the thickness and depth structure of the generated voxels along the Z-axis.

- **Default Scaling**: The default depth generation creates natural, rounded contours by calculating the thickness based on the sprite's silhouette. This works bethe depth axis to create a solid object.st for rounded or organic objects.
- **Biased Depth Scaling**: You should use biased depth scaling when your object has varying shapes or requires specific depth fine-tuning. This feature allows you to manually adjust (bias) the depth scale at the **top**, **middle**, and **bottom** sections of the sprite, giving you more precise control over the 3D geometry rather than relying solely on the default rounded interpolation.

## Download
Checkout https://github.com/GazPrash/2d-to-3d-voxelizer/releases

## Building
This project is built using **Wails**. You will need to setup the following:

### 1. Prerequisites

You will need **Go** (version 1.21+ recommended) and **Node.js** (with npm) installed on your system.

On Linux distributions, you must install **GTK3** and **WebKit2GTK** development libraries before building; (**MacOS** users can skip to the next step).
* **Debian / Ubuntu:**
  ```bash
  sudo apt update
  sudo apt install -y libgtk-3-dev libwebkit2gtk-4.0-dev build-essential

* **Arch Linux:**
  ```bash
  sudo pacman -Syu
  sudo pacman -S --needed gtk3 webkit2gtk base-devel

* **Fedora:**
  ```bash
  sudo dnf check-update
  sudo dnf groupinstall "Development Tools"
  sudo dnf install gtk3-devel webkit2gtk3-devel

### 2. Install Wails CLI
If you don't have the Wails CLI installed globally, install it via Go:
```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```
**Make sure your go/bin directory is in your system's PATH.**

### 3. Build the Application
Clone the main repo, navigate to the project directory, and run the following command to compile the production-ready binary:
```bash
# Clone the repository
git clone https://github.com/GazPrash/2d-to-3d-voxelizer.git
```
or via ssh
```bash
git clone git@github.com:GazPrash/2d-to-3d-voxelizer.git 
```
and then;

```bash
cd 2d-to-3d-voxelizer
wails build
```
The compiled executable will be located in the build/bin/ directory.

### 4. Development Mode
To run the application in live-development mode (with hot-reloading for the frontend):
```bash
wails dev
```