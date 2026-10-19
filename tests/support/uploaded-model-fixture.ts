/** Authored GLB triangle, used only to exercise upload validation and the viewer. */
export function uploadedModelFixture(external=false){
 const positions=new Float32Array([0,0,0,1,0,0,0,1,0]);
 const manifest={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:36,...(external?{uri:'https://example.invalid/private.bin'}:{})}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36,target:34962}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]};
 const text=JSON.stringify(manifest),json=Buffer.from(text.padEnd(Math.ceil(Buffer.byteLength(text)/4)*4,' ')),header=Buffer.alloc(20),bin=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+36,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);bin.writeUInt32LE(36,0);bin.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,json,bin,Buffer.from(positions.buffer)]);
}
