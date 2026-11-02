import type {NextConfig} from 'next';
import {validateFrontendDeployment} from './lib/deployment.cjs';
if(process.env.VERCEL==='1')validateFrontendDeployment();
const config: NextConfig = {
  async headers() {
    return ['/auth/:path*', '/signup', '/login', '/forgot-password', '/reset-password', '/account'].map(source => ({source, headers: [{key: 'Referrer-Policy', value: 'no-referrer'}]}));
  },
};
export default config;
