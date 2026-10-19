import {expect,it} from 'vitest';
import {projectReviewedTourForInventory} from '../../apps/api/src/inventory/digitization/inventory-tour-projection';

function fixture(){
 const a=crypto.randomUUID(),b=crypto.randomUUID();
 const approval={id:crypto.randomUUID(),version:1 as const,inputRevision:4,tourReviewRequestId:crypto.randomUUID(),tourRevisionId:crypto.randomUUID(),decision:'approved' as const,reason:'Private reviewer reason',excludedNodeIds:[crypto.randomUUID()],projectionConfirmed:true,privacyConfirmed:true,publiclyServed:false as const,manifest:{schemaVersion:1 as const,geometryRevisionId:crypto.randomUUID(),entryNodeId:b,nodes:[{id:a,label:'Entrance',tierArtifactIds:[crypto.randomUUID(),crypto.randomUUID()],captureDeclaration:'genuine_360_capture' as const,roomId:'private-room',headingDegrees:null,planPosition:{floorId:'private-floor',x:120,y:300,confirmed:true as const},hotspots:[{targetNodeId:b,label:'Continue',yaw:30,pitch:0}]},{id:b,label:'Living room',tierArtifactIds:[crypto.randomUUID()],captureDeclaration:'genuine_360_capture' as const,roomId:null,headingDegrees:0,hotspots:[{targetNodeId:a,label:'Return',yaw:-30,pitch:0}]}]}};
 const current={approvalId:approval.id,approvalVersion:1,inputRevision:4,tourRevisionId:approval.tourRevisionId,publicationConsent:true};return {approval,current};
}
it('pending inventory projection preserves navigation and unknown headings while withholding private identity, geometry and reason',()=>{
 const {approval,current}=fixture(),result=projectReviewedTourForInventory(approval,current),publicJson=JSON.stringify(result.projection);
 for(const secret of [approval.id,approval.tourReviewRequestId,approval.tourRevisionId,approval.reason,approval.manifest.geometryRevisionId,approval.excludedNodeIds[0],'private-room','private-floor',...approval.manifest.nodes.flatMap(node=>[node.id,...node.tierArtifactIds])])expect(publicJson).not.toContain(secret);
 expect(result.projection.entryNode).toBe('node-2');expect(result.projection.nodes[0].hotspots[0].targetNode).toBe('node-2');expect(result.projection.nodes[1].hotspots[0].targetNode).toBe('node-1');expect(result.projection.nodes[0].headingDegrees).toBeNull();expect(result.privateBindings.map(binding=>binding.artifactId)).toEqual(approval.manifest.nodes.flatMap(node=>node.tierArtifactIds));expect(result.publiclyServed).toBe(false);
});
it('denies missing consent, rejected or incomplete reviews and stale approval/input/tour identities',()=>{
 const {approval,current}=fixture();
 for(const patch of [{publicationConsent:false},{approvalId:crypto.randomUUID()},{approvalVersion:2},{inputRevision:5},{tourRevisionId:crypto.randomUUID()}])expect(()=>projectReviewedTourForInventory(approval,{...current,...patch})).toThrow();
 for(const patch of [{decision:'rejected'},{projectionConfirmed:false},{privacyConfirmed:false},{manifest:null}])expect(()=>projectReviewedTourForInventory({...approval,...patch},current)).toThrow();
});
it('denies forged excluded/undeclared nodes, dangling navigation and unknown private fields instead of publishing them',()=>{
 const {approval,current}=fixture();expect(()=>projectReviewedTourForInventory({...approval,excludedNodeIds:[approval.manifest.nodes[0].id]},current)).toThrow();
 for(const patch of [{captureDeclaration:null},{sourceObjectKey:'private/source'},{hotspots:[{targetNodeId:crypto.randomUUID(),label:'Dangling',yaw:0,pitch:0}]}])expect(()=>projectReviewedTourForInventory({...approval,manifest:{...approval.manifest,nodes:[{...approval.manifest.nodes[0],...patch},approval.manifest.nodes[1]]}},current)).toThrow();
});
