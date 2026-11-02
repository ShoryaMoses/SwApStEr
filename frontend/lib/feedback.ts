/** Optional public form link. Never prefill tokens, email, record IDs or private limits. */
export function feedbackUrl(value=process.env.NEXT_PUBLIC_FEEDBACK_URL){
  if(!value)return null;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.toString():null}catch{return null}
}
