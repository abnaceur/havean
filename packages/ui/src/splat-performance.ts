export type ScenePerformanceReport={
 schemaVersion:1; measuredAt:string; browser:string;
 viewport:{width:number;height:number;pixelRatio:number};
 splatCount:number;downloadBytes:number;downloadMilliseconds:number;firstRenderMilliseconds:number;
 sample:{frames:number;elapsedMilliseconds:number;framesPerSecond:number;frameIntervalP50Milliseconds:number;frameIntervalP95Milliseconds:number};
 memory:{sceneTypedArrayBytes:number;rendererGeometries:number;rendererTextures:number;gpuBytes:null};
 limitations:string[];
};
/** Report observed RAF render cadence. GPU timing/memory cannot be inferred
 * from renderer object counts or from browser animation callbacks. */
export function sceneFrameSample(timestamps:readonly number[]){
 if(timestamps.length<3||timestamps.some((time,index)=>!Number.isFinite(time)||(index>0&&time<=timestamps[index-1])))throw Error('A positive ordered frame sample is required.');
 const intervals=timestamps.slice(1).map((time,index)=>time-timestamps[index]).sort((a,b)=>a-b);
 const elapsedMilliseconds=timestamps[timestamps.length-1]-timestamps[0];
 return {frames:timestamps.length-1,elapsedMilliseconds,framesPerSecond:(timestamps.length-1)*1000/elapsedMilliseconds,frameIntervalP50Milliseconds:intervals[Math.ceil(intervals.length*.5)-1],frameIntervalP95Milliseconds:intervals[Math.ceil(intervals.length*.95)-1]};
}
