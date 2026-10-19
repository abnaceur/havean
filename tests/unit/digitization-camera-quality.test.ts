import {expect,it} from 'vitest';
import {cameraReviewMeasurements} from '../../apps/api/src/inventory/digitization/camera-quality.js';

it('reports disconnected reconstructions without double-counting their registered views',()=>{
 // Synthetic COLMAP summaries: this checks review projection, not capture accuracy.
 const first={registeredCameraCount:12,pointCount:600,connectedComponentCount:1};
 const second={registeredCameraCount:8,pointCount:400,connectedComponentCount:2};
 expect(cameraReviewMeasurements([second,first])).toEqual({registeredCameraCount:12,pointCount:600,connectedComponentCount:3});
 expect(cameraReviewMeasurements([first])).toEqual(first);
 expect(cameraReviewMeasurements([])).toEqual({registeredCameraCount:0,pointCount:0,connectedComponentCount:0});
});
