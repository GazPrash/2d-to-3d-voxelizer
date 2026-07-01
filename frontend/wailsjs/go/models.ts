export namespace main {
	
	export class FrontendSettings {
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
	
	    static createFrom(source: any = {}) {
	        return new FrontendSettings(source);
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
	    }
	}

}

