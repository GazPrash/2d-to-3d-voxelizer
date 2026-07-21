export namespace backend {
	
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

