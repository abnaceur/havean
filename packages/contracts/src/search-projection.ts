import {models} from './generated/models';

/** Increment when the public document or its numeric comparison encoding changes. */
export const listingSearchSchemaVersion=2;
export const listingSearchSettings={
 searchableAttributes:['title','description','community','district','features'],
 filterableAttributes:['city','district','districtId','communityId','transaction','segment','status','beds','livingRooms','orientation','elevator','furnishing','features','currency','rentPeriod','priceMinor','pricePrecisionSafe','areaNumber','publishedOrder','projectionSchemaVersion','neighborhoodId','builtYear','floorCategory','buildingType','finishing','heating','ownership','holdingPeriod','tourAvailable'],
 sortableAttributes:['publishedAt','publishedOrder','priceMinor','priceMissing','areaNumber','id'],
};

/** Exact minor units only. Unsafe legacy amounts remain strings and require SQL comparison. */
export function exactPriceMinor(price:string|null):number|null{
 if(price===null)return null;
 if(!/^\d+(?:\.\d{1,2})?$/.test(price))throw Error('INVALID_SEARCH_PRICE');
 const [whole,fraction='']=price.split('.'),minor=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 return minor<=BigInt(Number.MAX_SAFE_INTEGER)?Number(minor):null;
}

export function publicListingSearchDocument(input:unknown){
 // Validate and strip unknown fields before any data leaves the database boundary.
 // PostgreSQL timestamps are Dates; transport documents use ISO strings.
 const doc=models.public_listings.parse(JSON.parse(JSON.stringify(input)));
 if(doc.status!=='published')throw Error('NONPUBLIC_SEARCH_DOCUMENT');
 const priceMinor=exactPriceMinor(doc.price);
 return {...doc,projectionSchemaVersion:listingSearchSchemaVersion,sourceVersion:doc.version,
  priceMinor,priceMissing:doc.price===null,pricePrecisionSafe:doc.price===null||priceMinor!==null,
  areaNumber:Number(doc.area),publishedOrder:doc.publishedAt?Date.parse(doc.publishedAt):0};
}
