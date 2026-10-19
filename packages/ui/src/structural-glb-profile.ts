/** Only the engine's self-contained binary profile may enter the private loader. */
export function inspectStructuralGlb(bytes:ArrayBuffer){
 const view=new DataView(bytes);if(bytes.byteLength<28||bytes.byteLength>32*1024*1024||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.byteLength||view.getUint32(16,true)!==0x4e4f534a)throw Error('Invalid structural model.');
 const length=view.getUint32(12,true);if(length>4*1024*1024||20+length+8>bytes.byteLength)throw Error('Invalid model manifest.');
 const manifest=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,length))) as {buffers?:{uri?:string;byteLength:number}[];images?:unknown[];extensionsUsed?:string[];meshes?:unknown[];asset?:{version?:string;extras?:{furnishingCount?:number;geometryId?:string;modelType?:string;metricMeasurementsAvailable?:boolean;scaleStatus?:string}}};
 if(manifest.asset?.version!=='2.0'||manifest.buffers?.length!==1||manifest.buffers[0].uri!==undefined||manifest.images?.length||manifest.extensionsUsed?.length||!manifest.meshes?.length||manifest.meshes.length>5000||view.getUint32(24+length,true)!==0x004e4942||view.getUint32(20+length,true)+28+length!==bytes.byteLength)throw Error('Unsupported structural model profile.');
 return manifest;
}
