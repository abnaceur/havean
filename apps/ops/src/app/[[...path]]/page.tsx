import {redirect,notFound} from 'next/navigation';
import Workspace from '../../workspace';
export default async function Page({params}:{params:Promise<{path?:string[]}>}){const {path=[]}=await params;if(!path.length)redirect('/ops');if(path[0]!=='ops')notFound();return <Workspace section={path[1]||'overview'} consumerHomeUrl={(process.env.PUBLIC_WEB_URL||'http://localhost:8088')+'/bj'}/>;}
