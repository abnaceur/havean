import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import Providers from './providers';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
export const metadata:Metadata={title:{default:'Haven · Find a place to call yours',template:'%s · Haven'},description:'Discover current homes, rentals, communities and property services. Clear details and a place for your next chapter.',metadataBase:new URL(process.env.PUBLIC_WEB_URL||'http://localhost:8088')};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="en"><body><Providers>{children}</Providers></body></html>;}
