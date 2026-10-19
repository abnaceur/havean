'use client';
import {DigitizationSceneEvidence} from './digitization-scene-evidence';
import {useCallback,useEffect,useRef,useState} from 'react';
import {SubmitModelReview} from './digitization-model-review';
import {DigitizationScenePrivacy} from './digitization-scene-privacy';
import {DigitizationSceneRegistration} from './digitization-scene-registration';
import {sdk} from '@haven/contracts';
import {DigitizationSceneNavigation} from './digitization-scene-navigation';
import {ErrorBox} from '@haven/ui';
type Tiers=Awaited<ReturnType<typeof sdk.DigitizationController_sceneTiers>>['data'];
export function DigitizationScenePreview({workspaceId,autoOpen=false,reviewActions=false}:{workspaceId:string;autoOpen?:boolean;reviewActions?:boolean}){
 const [tiers,setTiers]=useState<Tiers>([]),[selected,setSelected]=useState(''),[error,setError]=useState('');const generation=useRef(0);
 const reload=useCallback(async(preferLatest=false)=>{const request=++generation.current;try{const result=await sdk.DigitizationController_sceneTiers({params:{id:workspaceId}});if(request!==generation.current)return;setTiers(result.data);const linked=new URL(window.location.href).searchParams.get('sceneTier');setSelected(old=>!preferLatest&&result.data.some(t=>t.id===old)?old:!preferLatest&&result.data.some(t=>t.id===linked)?linked!:result.data[0]?.id??'');setError('');}catch(e){if(request!==generation.current)return;setTiers([]);setSelected('');setError(e instanceof Error?e.message:'Scene preview unavailable.');}},[workspaceId]);
 useEffect(()=>{setTiers([]);setSelected('');void reload();return()=>{generation.current++;};},[reload]);
 useEffect(()=>{const ready=(event:Event)=>{if((event as CustomEvent).detail===workspaceId)void reload(true);};window.addEventListener('digitization-scene-ready',ready);return()=>window.removeEventListener('digitization-scene-ready',ready);},[reload,workspaceId]);
 const tier=tiers.find(t=>t.id===selected);
 return <section className="workspace-panel" aria-label="Private reconstructed property"><h2>Captured 3D scene</h2>{!autoOpen&&<p><a href={'/ops/digitization?workspace='+encodeURIComponent(workspaceId)+'&view=scene'}>Open direct scene preview</a></p>}<button className="button secondary" onClick={()=>void reload(true)}>Reload reconstructed scenes</button>{error&&<ErrorBox message={error}/>}<p>Scenes remain private pending independent privacy and render review. Unavailable rooms and measurements are not inferred.</p>{tiers.length===0?<p>No reconstructed scene is available for this source revision.</p>:<><label>Private scene tier<select value={selected} onChange={e=>setSelected(e.target.value)}>{tiers.map((t,index)=><option key={t.id} value={t.id}>Scene tier {index+1} · {t.splatCount} splats · {t.byteSize} bytes</option>)}</select></label>{tier&&<><DigitizationSceneNavigation initialView={tier.initialView} captureViews={tier.captureViews} autoOpen={autoOpen} key={tier.id} workspaceId={workspaceId} artifactId={tier.id} onScopeLost={()=>{setTiers([]);setSelected('');setError('Scene access changed. Reload the workspace.');}}/>{(!autoOpen||reviewActions)&&<><SubmitModelReview key={tier.id+'-model-review'} workspaceId={workspaceId} candidate={{modelType:'splat',sceneArtifactId:tier.id}}/><DigitizationScenePrivacy key={tier.id+'-privacy'} workspaceId={workspaceId} artifactId={tier.id}/><DigitizationSceneRegistration key={tier.id+'-registration'} workspaceId={workspaceId} artifactId={tier.id}/></>}<DigitizationSceneEvidence key={tier.id+'-evidence'} workspaceId={workspaceId} artifactId={tier.id}/></>}</>}</section>;
}
