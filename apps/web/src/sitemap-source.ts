import {sitemapPage} from '@haven/contracts';
import {webOrigin} from './seo';
export const xml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export async function sitemapData(page=0){const r=await fetch((process.env.API_INTERNAL_URL||'http://api:4000')+'/api/v1/seo/sitemap?page='+page,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Public sitemap source unavailable');return sitemapPage.parse((await r.json()).data);}
export function sitemapXML(entries:Awaited<ReturnType<typeof sitemapData>>['entries']){return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+entries.map(e=>'<url><loc>'+xml(webOrigin()+e.path)+'</loc>'+(e.lastModified?'<lastmod>'+xml(e.lastModified)+'</lastmod>':'')+'</url>').join('')+'</urlset>';}
export const sitemapHeaders={'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
