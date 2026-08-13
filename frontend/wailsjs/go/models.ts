export namespace backend {
	
	export class EditAction {
	    type: string;
	    id: string;
	    x: number;
	    y: number;
	    z: number;
	    color: string;
	
	    static createFrom(source: any = {}) {
	        return new EditAction(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.id = source["id"];
	        this.x = source["x"];
	        this.y = source["y"];
	        this.z = source["z"];
	        this.color = source["color"];
	    }
	}
	export class Settings {
	    mode: string;
	    repeated: boolean;
	    shape: string;
	    biasedScalingEnabled: boolean;
	    biasedScaleTop: number;
	    biasedScaleMiddle: number;
	    biasedScaleBottom: number;
	    depthScale: number;
	    flatDepth: number;
	    voxelScale: number;
	    capsulePower: number;
	    baseThickness: number;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.repeated = source["repeated"];
	        this.shape = source["shape"];
	        this.biasedScalingEnabled = source["biasedScalingEnabled"];
	        this.biasedScaleTop = source["biasedScaleTop"];
	        this.biasedScaleMiddle = source["biasedScaleMiddle"];
	        this.biasedScaleBottom = source["biasedScaleBottom"];
	        this.depthScale = source["depthScale"];
	        this.flatDepth = source["flatDepth"];
	        this.voxelScale = source["voxelScale"];
	        this.capsulePower = source["capsulePower"];
	        this.baseThickness = source["baseThickness"];
	    }
	}

}

export namespace main {
	
	export class ModelOutput {
	    objContent: string;
	    mtlContent: string;
	    voxelCount: number;
	    palette: string[];
	
	    static createFrom(source: any = {}) {
	        return new ModelOutput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.objContent = source["objContent"];
	        this.mtlContent = source["mtlContent"];
	        this.voxelCount = source["voxelCount"];
	        this.palette = source["palette"];
	    }
	}

}

