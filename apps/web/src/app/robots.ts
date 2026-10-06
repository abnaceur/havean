import type {MetadataRoute} from 'next';
import {webOrigin} from '../seo';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/account','/tenant','/ops','/api/']},sitemap:webOrigin()+'/sitemap.xml'};}
