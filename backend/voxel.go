package backend

type VoxelMap struct {
	shards  []voxelShard
	Palette []string
}

type voxelShard struct {
	m map[Vector3]Voxel
}

func NewVoxelMap(width int) *VoxelMap {
	vm := &VoxelMap{
		shards: make([]voxelShard, width),
	}

	for i := range width {
		vm.shards[i].m = make(map[Vector3]Voxel, 1024)
	}
	return vm
}

func (vm *VoxelMap) Get(v Vector3) (Voxel, bool) {
	if v.x < 0 || v.x >= len(vm.shards) {
		return Voxel{}, false
	}
	val, ok := vm.shards[v.x].m[v]
	return val, ok
}

func (vm *VoxelMap) Set(v Vector3, vox Voxel) {
	if v.x >= 0 && v.x < len(vm.shards) {
		vm.shards[v.x].m[v] = vox
	}
}

func (vm *VoxelMap) Clear() {
	for i := range len(vm.shards) {
		vm.shards[i].m = nil
	}
}

func (vm *VoxelMap) Delete(v Vector3) {
	if v.x >= 0 && v.x < len(vm.shards) {
		delete(vm.shards[v.x].m, v)
	}
}
