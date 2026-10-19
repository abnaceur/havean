/** Each COLMAP model has its own coordinate frame. Keep the largest model's
 * camera/point counts separate from connectivity across every returned model.
 * Summing registered views would double-count views shared by submodels. */
export function cameraReviewMeasurements(models:readonly {registeredCameraCount:number;pointCount:number;connectedComponentCount:number}[]){
 const largest=models.reduce<typeof models[number]|null>((current,model)=>!current||model.registeredCameraCount>current.registeredCameraCount?model:current,null);
 return {registeredCameraCount:largest?.registeredCameraCount??0,pointCount:largest?.pointCount??0,connectedComponentCount:models.reduce((total,model)=>total+model.connectedComponentCount,0)};
}
