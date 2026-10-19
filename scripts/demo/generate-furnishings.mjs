import fs from 'node:fs';
const items=[];
function add(roomId,kind,label,x,y,width,depth,height,color='#c6bda8',rotation=0,bottom=0){items.push({id:'object-'+(items.length+1),roomId,kind,label,position:{x:1+x,y:11.2-y},bottom:String(bottom),rotationDegrees:rotation,width:String(width),depth:String(depth),height:String(height),color});}
// Coordinates are authored against the retained plan, never inferred from imagery.
add('living','rug','Woven living rug',2.65,2.45,3.6,2.8,.025,'#d2c5ae');
add('living','sofa','Linen three-seat sofa',.7,2.35,2.7,.95,.9,'#b4b99c',90);
add('living','coffee_table','Round oak coffee table',2.4,2.25,1.1,1.1,.43,'#ba9463');
add('living','armchair','Sage reading chair',3.75,1.4,.85,.9,.88,'#73846e',-145);
add('living','cabinet','Oak media console',4.4,.45,1.6,.5,.5,'#ad8258');
add('living','tv','Television',4.4,.45,1.15,.14,.68,'#303735',0,.51);
add('living','lamp','Reading floor lamp',4.5,1.5,.43,.43,1.6,'#e5dcca');
add('living','plant','Living room plant',.5,.5,.7,.7,1.55);
add('living','table','Oak dining table',4.3,4.35,1.45,1.25,.76,'#b88d5c');
for(const [x,y,a] of [[3.3,4.35,90],[5.3,4.35,-90],[4.3,3.5,180],[4.3,5.2,0]])add('living','chair','Dining chair',x,y,.48,.5,.86,'#a8ac91',a);
for(const x of [1,3.8])add('living','curtain','Linen living curtains',x,.18,.35,.18,2.5,'#d7cbb3');
add('living','picture','Framed abstract art',.15,3.6,.85,.05,.65,'#8b9d80',90,1.2);
add('kitchen','counter','Kitchen worktop and hob',1.1,9.1,1.9,.65,.9,'#d7d3c5');
add('kitchen','sink','Kitchen sink',.5,7.7,.75,.6,.92,'#ddd9cb',90);
add('kitchen','fridge','Tall refrigerator',2.55,8.95,.7,.7,2,'#bfc5bf');
add('kitchen','cabinet','Kitchen wall storage',.4,8.7,.6,.4,.7,'#c6b89b',90,1.55);
add('kitchen','rug','Kitchen runner',1.7,7.65,1.1,1.75,.018,'#b6b5a1');
add('kitchen','plant','Counter herb plant',1.5,9.12,.24,.24,.35,'#79926a',0,.96);
add('bathroom','bathtub','Bath tub',5.35,8.15,.85,1.8,.55,'#ebe9df');
add('bathroom','toilet','Toilet',3.6,8.8,.56,.72,.78,'#e8e9e2');
add('bathroom','sink','Bathroom vanity',3.55,7.45,.85,.52,.85,'#d6c9ad',90);
add('bathroom','shower','Shower fixture',5.35,6.7,.9,.9,2.15,'#a1b5b6');
add('bathroom','rug','Bath mat',4.4,8.1,.8,1.15,.025,'#d8d4c5');
add('bathroom','picture','Vanity mirror frame',3.15,7.45,.6,.04,.75,'#abc5c9',90,1.25);
for(const [room,top,color] of [['bedroom-one',0,'#9cae94'],['bedroom-two',4.775,'#b4a6a0']]){
 add(room,'rug','Bedroom woven rug',8,top+2.65,2.9,3.15,.025,'#cfc7b7');
 add(room,'bed','Upholstered double bed',8,top+2.55,1.65,2.15,1.05,color);
 for(const x of [6.8,9.2]){add(room,'cabinet','Bedside table',x,top+1.65,.48,.46,.5,'#b99d76');add(room,'lamp','Bedside lamp',x,top+1.65,.24,.24,.4,'#e7dfd2',0,.51);}
 add(room,'wardrobe','Built-in wardrobe',8.45,top+4.35,2.4,.65,2.4,'#d8d4c4');
 add(room,'plant','Bedroom plant',9.55,top+.5,.55,.55,1.2);
 add(room,'curtain','Bedroom curtains',7,top+.17,.65,.16,2.5,'#d7cbb3');
}
fs.writeFileSync('assets/digitization-furnished/furnishings.json',JSON.stringify(items,null,2)+'\n');
console.log(`Authored ${items.length} property objects.`);
