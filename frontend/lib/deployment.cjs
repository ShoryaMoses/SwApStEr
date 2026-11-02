/** Node-loadable Vercel build validation. Never include configuration values in errors. */
function validateFrontendDeployment(settings=process.env){
  try{
    const url=new URL(settings.NEXT_PUBLIC_SUPABASE_URL || '');
    const key=settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!key.startsWith('sb_publishable_')||/\s/.test(key))throw Error();
  }catch{throw new Error('Configure a valid public Supabase HTTPS URL and publishable key for deployment.');}
  try{const url=new URL(settings.NEXT_PUBLIC_API_URL || '');if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error();}
  catch{throw new Error('NEXT_PUBLIC_API_URL must be an HTTPS backend origin.');}
}
module.exports={validateFrontendDeployment};
