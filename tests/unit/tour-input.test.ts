import {it,expect} from 'vitest';
import {pinchFieldOfView,projectTourHotspot} from '../../apps/web/src/tour-input';
it('spreading fingers zooms in, closing fingers zooms out, and zoom remains bounded',()=>{
 expect(pinchFieldOfView(70,100,200)).toBe(35);
 expect(pinchFieldOfView(70,100,50)).toBe(100);
 expect(pinchFieldOfView(70,100,1000)).toBe(30);
 expect(pinchFieldOfView(70,100,0)).toBe(100);
});
it('projects the camera direction at the center and hides viewpoints behind the camera',()=>{
 const view={yaw:35,pitch:20,fov:70};
 const center=projectTourHotspot({yaw:35,pitch:20},view,1)!;
 expect(center.left).toBeCloseTo(50);expect(center.top).toBeCloseTo(50);
 expect(projectTourHotspot({yaw:215,pitch:0},view,1)).toBeNull();
});
it('keeps room markers within the actual perspective viewport across screen shapes',()=>{
 const view={yaw:0,pitch:0,fov:70};
 expect(projectTourHotspot({yaw:50,pitch:0},view,0.5)).toBeNull();
 const wide=projectTourHotspot({yaw:50,pitch:0},view,2)!;
 expect(wide.left).toBeGreaterThan(50);expect(wide.left).toBeLessThan(100);
 expect(projectTourHotspot({yaw:0,pitch:60},view,2)).toBeNull();
});
