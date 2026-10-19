import {describe,it,expect} from 'vitest';
import {calendarDate,calendarDateLabel,calendarDays,monthEnd,shiftDate,shiftMonth,validCalendarDate} from '../../packages/ui/src/calendar-dates';
describe('property calendar dates',()=>{
 it('rejects malformed URL dates without formatting invalid instants',()=>{for(const date of ['not-a-date','2026-02-30','1900-01-01','2201-01-01']){expect(validCalendarDate(date)).toBe(false);expect(calendarDateLabel(date)).toBe('Choose a valid date');}expect(validCalendarDate('2028-02-29')).toBe(true);});
 it('uses the property date across UTC midnight',()=>{expect(calendarDate('2026-10-18T18:00:00Z','Asia/Shanghai')).toBe('2026-10-19');expect(calendarDate('2026-10-18T01:00:00Z','America/Los_Angeles')).toBe('2026-10-17');});
 it('keeps date arithmetic independent of daylight-saving transitions',()=>{expect(shiftDate('2026-03-08',1)).toBe('2026-03-09');expect(shiftDate('2026-11-01',-1)).toBe('2026-10-31');});
 it('handles leap years and year boundaries',()=>{expect(monthEnd('2028-02-01')).toBe('2028-02-29');expect(monthEnd('2026-02-01')).toBe('2026-02-28');expect(shiftMonth('2026-12-31',1)).toBe('2027-01-01');expect(shiftDate('2027-01-01',-1)).toBe('2026-12-31');});
 it('aligns Monday-first grids and includes every date exactly once',()=>{const dates=calendarDays('2026-02-01');expect(dates.slice(0,6)).toEqual(Array(6).fill(null));expect(dates[6]).toBe('2026-02-01');expect(dates.length%7).toBe(0);expect(new Set(dates.filter(Boolean)).size).toBe(28);expect(calendarDays('2026-03-01')).toHaveLength(42);});
 it('groups repeated local hours under the same property date',()=>{const first=new Date('2026-11-01T05:30:00Z'),second=new Date('2026-11-01T06:30:00Z');expect(calendarDate(first,'America/New_York')).toBe(calendarDate(second,'America/New_York'));expect(calendarDateLabel('2026-10-19')).toBe('Monday, 19 October 2026');});
});
