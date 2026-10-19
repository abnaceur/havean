import {expect,it} from 'vitest';
import {capturePreviewView} from '../../apps/api/src/inventory/digitization/capture-preview-view';
it('inverts recovered COLMAP camera poses and rejects invalid orientation',()=>{
 const model={connectedComponentCount:1,advisoryQualityPassed:true,cameraCalibrationGroups:{'1':{model:'PINHOLE',width:640,height:480,parameters:[500,500,320,240]}},cameraPoses:{'1':{cameraId:'1',worldToCameraQuaternion:[1,0,0,0],worldToCameraTranslation:[-2,-3,-4],observationCount:100}}};
 const view=capturePreviewView({models:[model]})!;expect(view.position).toEqual([2,3,4]);expect(view.aspectRatio).toBeCloseTo(4/3);expect(view.forward).toEqual([0,0,1]);expect(view.up).toEqual([-0,-1,-0]);expect(view.verticalFov).toBeCloseTo(51.282,2);
 model.cameraPoses['1'].worldToCameraQuaternion=[Math.SQRT1_2,Math.SQRT1_2,0,0];const rotated=capturePreviewView({models:[model]})!;expect(rotated.position[0]).toBeCloseTo(2);expect(rotated.position[1]).toBeCloseTo(4);expect(rotated.position[2]).toBeCloseTo(-3);expect(rotated.forward[1]).toBeCloseTo(1);expect(rotated.up[2]).toBeCloseTo(1);
 model.cameraPoses['1'].worldToCameraQuaternion=[2,0,0,0];expect(capturePreviewView({models:[model]})).toBeNull();expect(capturePreviewView({models:[]})).toBeNull();
});
