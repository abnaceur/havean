import {createHash} from 'node:crypto';
import type {DigitizationGeometryRevision} from '@haven/contracts';
import {renderStructuralGlb} from './structural-glb.js';

/** Prepare bytes for an independent review, never permission to serve them.
 * Private geometry IDs, labels, sources and review metadata cannot cross the
 * projection boundary. Measurements require a separate reviewed metric policy.
 */
export function prepareStructuralPublicDerivative(geometry:DigitizationGeometryRevision){
 const original=renderStructuralGlb(geometry),privateBody=original.body,jsonLength=privateBody.readUInt32LE(12),binaryStart=28+jsonLength;
 if(privateBody.readUInt32LE(0)!==0x46546c67||privateBody.readUInt32LE(4)!==2||privateBody.readUInt32LE(8)!==privateBody.length||privateBody.readUInt32LE(16)!==0x4e4f534a||privateBody.readUInt32LE(24+jsonLength)!==0x004e4942||privateBody.readUInt32LE(20+jsonLength)!==privateBody.length-binaryStart)throw Error('STRUCTURAL_PROJECTION_PROFILE_CHANGED');
 const furnished=Boolean(geometry.furnishings?.length);
 const source=JSON.parse(privateBody.subarray(20,20+jsonLength).toString()),binary=privateBody.subarray(binaryStart);
 const document={
  asset:{version:'2.0',generator:'Haven structural public projection v1',extras:{...(furnished?{furnishingCount:geometry.furnishings!.length,furnishingBasis:'supplied_unverified'}:{}),modelType:'structural',scaleStatus:'estimated',metricMeasurementsAvailable:false,coordinateConversion:'canonical(x,y,z)-to-gltf(x,z,-y)',slabThickness:{amount:'0.10',unit:'m',basis:'illustrative_assumption'},limitations:['Estimated visualization, not an official survey or built-up area.','Supplied heights and slab thickness remain visualization assumptions.','Stair connections and unconfirmed openings are not rendered.']}},
  scene:0,scenes:[{nodes:source.nodes.map((_node:unknown,index:number)=>index)}],
  nodes:source.nodes.map((node:{mesh:number;extras?:{kind?:string}},index:number)=>({name:'Model part '+(index+1),mesh:node.mesh,...(furnished?{extras:{kind:['floor_slab','wall','furnishing'].includes(node.extras?.kind??'')?node.extras!.kind:'part'}}:{})})),
  meshes:source.meshes.map((mesh:{primitives:{attributes:{POSITION:number;NORMAL:number};material:number;mode:number}[]})=>({primitives:mesh.primitives.map(primitive=>({attributes:{POSITION:primitive.attributes.POSITION,NORMAL:primitive.attributes.NORMAL},material:primitive.material,mode:primitive.mode}))})),
  materials:source.materials.map((material:{pbrMetallicRoughness:{baseColorFactor:number[];metallicFactor:number;roughnessFactor:number};doubleSided:boolean},index:number)=>({name:'Material '+(index+1),pbrMetallicRoughness:{baseColorFactor:material.pbrMetallicRoughness.baseColorFactor,metallicFactor:material.pbrMetallicRoughness.metallicFactor,roughnessFactor:material.pbrMetallicRoughness.roughnessFactor},doubleSided:material.doubleSided})),
  bufferViews:source.bufferViews.map((view:{buffer:number;byteOffset:number;byteLength:number;target:number})=>({buffer:view.buffer,byteOffset:view.byteOffset,byteLength:view.byteLength,target:view.target})),
  accessors:source.accessors.map((accessor:{bufferView:number;componentType:number;count:number;type:string;min?:number[];max?:number[]})=>({bufferView:accessor.bufferView,componentType:accessor.componentType,count:accessor.count,type:accessor.type,...(accessor.min?{min:accessor.min,max:accessor.max}:{})})),
  buffers:[{byteLength:binary.length}],
 };
 const raw=Buffer.from(JSON.stringify(document)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,0x20);raw.copy(json);
 const header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(binary.length,0);binHeader.writeUInt32LE(0x004e4942,4);
 const body=Buffer.concat([header,json,binHeader,binary]);
 return {body,sha256:createHash('sha256').update(body).digest('hex'),format:'glb' as const,processingProfile:'structural-public-v1' as const,geometryRevisionId:geometry.id,geometryRevision:geometry.revision,scaleStatus:'estimated' as const,metricMeasurementsAvailable:false as const,privacyReview:'pending' as const,publicationReview:'pending' as const,publiclyServed:false as const};
}
