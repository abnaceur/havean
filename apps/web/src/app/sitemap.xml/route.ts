import {sitemapData,sitemapXML,sitemapHeaders,xml} from '../../sitemap-source';
import {webOrigin} from '../../seo';
export const dynamic='force-dynamic';
export async function GET(){try{const r=await sitemapData();if(r.pages===1)return new Response(sitemapXML(r.entries),{headers:sitemapHeaders});return new Response('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+Array.from({length:r.pages},(_,i)=>'<sitemap><loc>'+xml(webOrigin()+'/sitemaps/'+i+'.xml')+'</loc></sitemap>').join('')+'</sitemapindex>',{headers:sitemapHeaders});}catch{return new Response('Sitemap temporarily unavailable',{status:503,headers:{'Cache-Control':'no-store','Retry-After':'30'}});}}
