import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import Providers from './providers';
import './globals.css';
import '@haven/ui/haven-design.css';
import '@haven/ui/haven-spacing.css';
import '@haven/ui/chat-experience.css';
export const metadata:Metadata={title:'Haven · Professional workspace',robots:{index:false,follow:false}};
export default function Layout({children}:{children:ReactNode}){return <html lang="en"><body><Providers>{children}</Providers></body></html>;}
