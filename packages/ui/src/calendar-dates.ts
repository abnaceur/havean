// Calendar arithmetic uses date-only UTC values; appointment dates use the property zone.
export function validCalendarDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='1970-01-01'&&value<='2200-12-31'&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function calendarDate(instant:string|Date,timeZone:string){return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));}
export function shiftDate(value:string,days:number){const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
export function shiftMonth(value:string,months:number){const date=new Date(value.slice(0,7)+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+months);return date.toISOString().slice(0,10);}
export function monthEnd(value:string){return shiftDate(shiftMonth(value,1),-1);}
export function calendarDays(month:string){const start=month.slice(0,7)+'-01',offset=(new Date(start+'T12:00:00Z').getUTCDay()+6)%7,count=Number(monthEnd(start).slice(-2));return Array.from({length:Math.ceil((offset+count)/7)*7},(_,i)=>i<offset||i>=offset+count?null:shiftDate(start,i-offset));}
export function calendarDateLabel(value:string){return validCalendarDate(value)?new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(value+'T12:00:00Z')):'Choose a valid date';}
