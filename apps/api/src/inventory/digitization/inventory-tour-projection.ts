import {digitizationTourReviewApproval} from '@haven/contracts';

/** Pure preparation boundary. Callers still must check current actor, mandate,
 * source bytes and workflow under transaction before storing a pending revision.
 * This neither grants public access nor changes private artifact visibility. */
export function projectReviewedTourForInventory(approvalValue:unknown,current:{approvalId:string;approvalVersion:number;inputRevision:number;tourRevisionId:string;publicationConsent:boolean}){
 const approval=digitizationTourReviewApproval.parse(approvalValue);
 if(current.publicationConsent!==true)throw new Error('Explicit tour publication consent is required.');
 if(approval.id!==current.approvalId||approval.version!==current.approvalVersion||approval.inputRevision!==current.inputRevision||approval.tourRevisionId!==current.tourRevisionId)throw new Error('The reviewed tour is no longer current.');
 if(approval.decision!=='approved'||!approval.projectionConfirmed||!approval.privacyConfirmed||!approval.manifest)throw new Error('An independently approved projection and privacy review is required.');
 const graph=approval.manifest;
 const excluded=new Set(approval.excludedNodeIds);
 if(graph.nodes.some(node=>excluded.has(node.id)||node.captureDeclaration!=='genuine_360_capture'))throw new Error('The approval contains an excluded or undeclared capture.');
 // Ordinals are local to this pending package. Source/tour UUIDs never become
 // public identifiers; identical sources on another mandate have no shared grant.
 const slots=new Map(graph.nodes.map((node,index)=>[node.id,`node-${index+1}`]));
 const bindings=graph.nodes.flatMap(node=>node.tierArtifactIds.map((artifactId,index)=>({nodeSlot:slots.get(node.id)!,tierSlot:`tier-${index+1}`,artifactId})));
 const projection={schemaVersion:1 as const,entryNode:slots.get(graph.entryNodeId)!,nodes:graph.nodes.map(node=>({slot:slots.get(node.id)!,label:node.label,headingDegrees:node.headingDegrees,tiers:node.tierArtifactIds.map((_id,index)=>`tier-${index+1}`),hotspots:node.hotspots.map(hotspot=>({targetNode:slots.get(hotspot.targetNodeId)!,label:hotspot.label,yaw:hotspot.yaw,pitch:hotspot.pitch}))}))};
 return {projection,privateBindings:bindings,publiclyServed:false as const};
}
