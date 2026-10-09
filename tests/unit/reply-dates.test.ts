import {it,expect} from 'vitest';
import {replyDates} from '../../apps/api/src/platform/reply-dates';
it('native PostgreSQL dates retain their JSON wire form, exact large money and independent untouched source branches',()=>{
 const untouched={price:'9999999999999999.99',missing:null},at=new Date('2026-10-07T00:00:00.000Z'),source={data:[{publishedAt:at,nested:{due:at,price:'100.10'},untouched}],meta:{total:1}};
 const result=replyDates(source);
 expect(JSON.stringify(result)).toBe(JSON.stringify(source));
 expect(result).not.toBe(source);expect(source.data[0].publishedAt).toBe(at);
 expect((result as typeof source).data[0].untouched).toBe(untouched);
 expect(replyDates(untouched)).toBe(untouched);
 expect(replyDates({date:new Date(NaN)})).toEqual({date:null});
});
