import type {PublicRentalTerms as Terms} from '@haven/contracts';
export function exactRentalAmount(amount:string,currency:string){const [whole,fraction='00']=amount.split('.');return currency+' '+whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+fraction.padEnd(2,'0');}
export function RentalDetailTerms({terms,price,currency,period}:{terms:Terms|null;price:string;currency:string;period:string|null}){const unavailable='Not provided',labels:Record<string,string>={day:'day',month:'month',year:'year'};return <section className="detail-section rental-detail-terms"><h2>Rental terms</h2>{!terms&&<p role="status">Rental terms are unavailable. Ask the property team for the deposit, minimum term and utility conditions.</p>}<dl className="facts-table">{[
 ['Rental mode',terms?.mode==='entire'?'Entire property':terms?.mode==='shared'?'Shared room':unavailable],
 ['Rent amount',exactRentalAmount(price,currency)+(period&&labels[period]?' per '+labels[period]:' — billing period not provided')],
 ['Deposit',terms?.depositAmount!==null&&terms?.depositAmount!==undefined&&terms?.currency?exactRentalAmount(terms.depositAmount,terms.currency):unavailable],
 ['Minimum term',terms?.minimumMonths?terms.minimumMonths+(terms.minimumMonths===1?' month':' months'):unavailable],
 ['Utilities',terms?.utilities.length?terms.utilities.join(' · '):unavailable],
 ['Move-in date',terms?.moveInDate||unavailable],
 ...(terms?.unitKind==='room'?[['Room',terms.roomLabel||unavailable],['Room attributes',terms.roomAttributes.length?terms.roomAttributes.join(' · '):unavailable]]:[])
 ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="fine-print">Amounts are recorded in {currency}. Utility charges and additional fees are not inferred from missing information. Confirm the recorded conditions with the property team before agreeing to a tenancy.</p></section>;}
