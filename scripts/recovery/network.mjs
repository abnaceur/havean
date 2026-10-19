function interval(cidr){
 const [address,rawPrefix]=cidr.split('/'),prefix=rawPrefix===undefined?32:Number(rawPrefix),parts=address.split('.').map(Number);
 if(parts.length!==4||parts.some(v=>!Number.isInteger(v)||v<0||v>255)||!Number.isInteger(prefix)||prefix<0||prefix>32)return null;
 const number=parts.reduce((total,part)=>total*256+part,0),size=2**(32-prefix),start=Math.floor(number/size)*size;return [start,start+size-1];
}
export function availableRecoverySubnet(used){
 const ranges=used.filter(value=>value!=='default'&&value!=='0.0.0.0/0'&&!value.endsWith('/1')).map(interval).filter(Boolean);
 // Private small internal test/recovery networks. Split default VPN routes do
 // not reserve an address range; concrete routes still do. This never
 // prunes existing networks or changes the daemon's global address pools.
 for(let index=0;index<256;index++){const cidr=`10.247.${200+Math.floor(index/16)}.${index%16*16}/28`,candidate=interval(cidr);if(!ranges.some(range=>candidate[0]<=range[1]&&range[0]<=candidate[1]))return cidr;}
 throw Error('ISOLATED_RECOVERY_SUBNET_UNAVAILABLE');
}
export function inspectRecoverySubnet(docker,hostRoutes=[]){
 const ids=docker(['network','ls','-q']).trim().split('\n').filter(Boolean),networks=ids.length?JSON.parse(docker(['network','inspect',...ids])):[];
 return availableRecoverySubnet([...hostRoutes,...networks.flatMap(network=>(network.IPAM?.Config??[]).map(value=>value.Subnet).filter(Boolean))]);
}
