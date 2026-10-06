import type {NextConfig} from 'next';
const config:NextConfig={devIndicators:false,distDir:process.env.NEXT_DIST_DIR||'.next',transpilePackages:['@haven/ui','@haven/contracts','@haven/config'],allowedDevOrigins:['localhost'],async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'},{key:'X-Robots-Tag',value:'noindex, nofollow'}]}];}};
export default config;
