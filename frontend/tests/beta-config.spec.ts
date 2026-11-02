import {test,expect} from '@playwright/test';
import {feedbackUrl} from '../lib/feedback';
import {validateFrontendDeployment} from '../lib/deployment.cjs';
test('feedback links require HTTPS and never accept embedded credentials',()=>{expect(feedbackUrl('http://form.example.invalid')).toBeNull();expect(feedbackUrl('https://user:secret@form.example.invalid')).toBeNull();expect(feedbackUrl('javascript:alert(1)')).toBeNull();expect(feedbackUrl('https://form.example.invalid/feedback')).toBe('https://form.example.invalid/feedback')});
test('deployed frontend rejects missing or insecure API configuration without printing secrets',()=>{
 const keys=['NEXT_PUBLIC_API_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] as const;const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{process.env.NEXT_PUBLIC_SUPABASE_URL='https://auth.example.invalid';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_synthetic';for(const url of ['', 'http://localhost:8000','https://user:secret@api.example.invalid','https://api.example.invalid/path']){process.env.NEXT_PUBLIC_API_URL=url;expect(()=>validateFrontendDeployment()).toThrow('HTTPS backend origin')};process.env.NEXT_PUBLIC_API_URL='https://api.example.invalid';expect(()=>validateFrontendDeployment()).not.toThrow()}
 finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key]}}
});
