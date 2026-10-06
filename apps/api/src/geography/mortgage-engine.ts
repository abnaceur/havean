import Decimal from 'decimal.js';
import {mortgageSchema,type MortgageResult} from '@haven/contracts/mortgage';
// Local precision/rounding avoids changing arithmetic in unrelated API modules.
const D=Decimal.clone({precision:60,rounding:Decimal.ROUND_HALF_UP});
export function mortgage(input:unknown):MortgageResult{
 const x=mortgageSchema.parse(input),principal=new D(x.price).minus(x.downPayment),rate=new D(x.annualRate).div(1200),months=x.years*12;
 const payment=(rate.isZero()?principal.div(months):principal.mul(rate).div(new D(1).minus(new D(1).plus(rate).pow(-months)))).toDecimalPlaces(2),principalStep=principal.div(months).toDecimalPlaces(2);
 let balance=principal,totalInterest=new D(0);const schedule:MortgageResult['schedule']=[];
 for(let month=1;month<=months;month++){
  const interest=balance.mul(rate).toDecimalPlaces(2),repaid=month===months?balance:D.min(balance,D.max(0,x.method==='equal_principal'?principalStep:payment.minus(interest)));
  balance=balance.minus(repaid);totalInterest=totalInterest.plus(interest);
  schedule.push({month,principal:repaid.toFixed(2),interest:interest.toFixed(2),payment:repaid.plus(interest).toFixed(2),balance:balance.toFixed(2)});
 }
 return {principal:principal.toFixed(2),monthlyPayment:schedule[0].payment,finalPayment:schedule[months-1].payment,totalInterest:totalInterest.toFixed(2),totalRepaid:principal.plus(totalInterest).toFixed(2),method:x.method,annualRate:new D(x.annualRate).toString(),months,schedule,assumptions:`${x.method==='equal_payment'?'Equal monthly payment':'Equal principal'} estimate. Nominal annual rate ${x.annualRate}%, divided by 12; ${months} monthly periods. Interest and payments use two-decimal half-up rounding. Principal never increases; the final payment clears remaining principal and may differ because of rounding. Taxes and lender fees excluded. Estimate only; no lender approval.`};
}
