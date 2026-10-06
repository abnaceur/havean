import Decimal from 'decimal.js';
/** Source areas are recorded in square metres. Display conversion never changes them. */
export function areaDisplay(squareMetres:string,unit:'m²'|'sq ft'='m²'){return unit==='m²'?squareMetres+' m²':new Decimal(squareMetres).mul('10.763910416709722').toDecimalPlaces(2).toFixed(2)+' sq ft';}
