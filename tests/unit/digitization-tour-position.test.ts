import {expect,it} from 'vitest';
import type {DigitizationGeometryRevision} from '../../packages/contracts/src/index';
import {requireTourPosition} from '../../apps/api/src/inventory/digitization/tour-position';
const geometry={rooms:[{id:'room',floorId:'floor',polygon:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],holes:[[{x:3,y:3},{x:5,y:3},{x:5,y:5},{x:3,y:5}]]}]} as unknown as DigitizationGeometryRevision;
it('plan capture positions require linked floor and room interior excluding holes and boundaries',()=>{
 const position={floorId:'floor',x:2,y:2,confirmed:true as const};expect(()=>requireTourPosition(geometry,'room',position)).not.toThrow();expect(()=>requireTourPosition(geometry,'room',null)).not.toThrow();for(const value of [{...position,x:0},{...position,x:11},{...position,x:4,y:4},{...position,x:3,y:4},{...position,floorId:'other'}])expect(()=>requireTourPosition(geometry,'room',value)).toThrow();expect(()=>requireTourPosition(geometry,'unknown',position)).toThrow();
});
