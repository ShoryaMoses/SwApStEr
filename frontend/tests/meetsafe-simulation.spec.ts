import {test,expect} from '@playwright/test';
import {code,completed,defaultTerms,initial,scheduled,State,transition} from '../lib/meetsafe/simulation';
const now=new Date(2026,10,2,12);
const step=(s:State,a:Parameters<typeof transition>[1])=>transition(s,a,now);
function schedule(){let s=step(initial('SESSION-A'),{type:'propose',terms:defaultTerms(now)});s=step(s,{type:'switch',role:'buyer'});return step(s,{type:'accept'});}
function verify(){let s=step(schedule(),{type:'reveal'});s=step(s,{type:'switch',role:'seller'});return step(s,{type:'redeem',code:code(s)});}
function finish(){let s=step(verify(),{type:'handoff'});s=step(s,{type:'switch',role:'buyer'});return step(s,{type:'handoff'});}
test('initial state has no implied meetup, verification, handoff or reviews',()=>{
 const s=initial('A');expect(scheduled(s)).toBe(false);expect(completed(s)).toBe(false);expect(s.verified).toBe(false);expect(s.reviews).toEqual({});expect(s.history).toHaveLength(1);
 expect(()=>step(s,{type:'accept'})).toThrow();expect(()=>step(s,{type:'handoff'})).toThrow();expect(()=>step(s,{type:'review',review:{stars:5,text:''}})).toThrow();
});
test('both must accept same terms; rescheduling invalidates old code and confirmations',()=>{
 let s=step(initial('A'),{type:'propose',terms:defaultTerms(now)});expect(s.accepted).toEqual({buyer:false,seller:true});expect(scheduled(s)).toBe(false);
 expect(step(s,{type:'accept'})).toEqual(s);
 s=step(s,{type:'switch',role:'buyer'});s=step(s,{type:'accept'});expect(scheduled(s)).toBe(true);
 s=step(s,{type:'reveal'});const oldCode=code(s);s=step(s,{type:'switch',role:'seller'});s=step(s,{type:'redeem',code:oldCode});s=step(s,{type:'handoff'});
 s=step(s,{type:'propose',terms:{...defaultTerms(now),time:'16:00'}});expect(scheduled(s)).toBe(false);expect(s.verified).toBe(false);expect(s.handed).toEqual({buyer:false,seller:false});expect(code(s)).not.toBe(oldCode);
 s=step(s,{type:'switch',role:'buyer'});s=step(s,{type:'accept'});s=step(s,{type:'reveal'});s=step(s,{type:'switch',role:'seller'});expect(()=>step(s,{type:'redeem',code:oldCode})).toThrow();
});
test('empty, malformed, impossible and past meeting details fail',()=>{
 for(const patch of [{location:' '},{date:'2020-01-01'},{date:'2026-02-30'},{date:'bad'},{time:'25:00'},{instructions:'x'.repeat(401)}]) expect(()=>step(initial('A'),{type:'propose',terms:{...defaultTerms(now),...patch}})).toThrow();
});
test('recognition descriptions belong to current simulated role',()=>{
 let s=step(initial('A'),{type:'describe',text:'Blue hoodie'});s=step(s,{type:'switch',role:'buyer'});s=step(s,{type:'describe',text:'Green backpack'});
 expect(s.descriptions).toEqual({buyer:'Green backpack',seller:'Blue hoodie'});expect(()=>step(s,{type:'describe',text:'x'.repeat(241)})).toThrow();
});
test('code is buyer-revealed, seller-redeemed and single-use',()=>{
 let s=schedule();expect(()=>step(s,{type:'redeem',code:code(s)})).toThrow();s=step(s,{type:'switch',role:'seller'});expect(()=>step(s,{type:'reveal'})).toThrow();expect(()=>step(s,{type:'redeem',code:code(s)})).toThrow();
 s=step(s,{type:'switch',role:'buyer'});s=step(s,{type:'reveal'});expect(step(s,{type:'reveal'})).toEqual(s);s=step(s,{type:'switch',role:'seller'});expect(()=>step(s,{type:'redeem',code:'wrong'})).toThrow();s=step(s,{type:'redeem',code:code(s)});expect(s.verified).toBe(true);expect(()=>step(s,{type:'redeem',code:code(s)})).toThrow();
});
for(const role of ['buyer','seller'] as const)test(`${role} confirms only its own handoff; both are required`,()=>{
 let s=step(verify(),{type:'switch',role});s=step(s,{type:'handoff'});expect(completed(s)).toBe(false);expect(s.handed[role]).toBe(true);expect(s.handed[role==='buyer'?'seller':'buyer']).toBe(false);expect(step(s,{type:'handoff'})).toEqual(s);
 s=step(s,{type:'switch',role:role==='buyer'?'seller':'buyer'});s=step(s,{type:'handoff'});expect(completed(s)).toBe(true);expect(()=>step(s,{type:'propose',terms:defaultTerms(now)})).toThrow();
});
test('issue blocks completion, resolution requires new confirmations, cancellation stops progress',()=>{
 let s=step(verify(),{type:'handoff'});s=step(s,{type:'issue',reason:'Item damaged'});expect(completed(s)).toBe(false);expect(s.handed.seller).toBe(false);expect(()=>step(s,{type:'handoff'})).toThrow();expect(()=>step(s,{type:'review',review:{stars:5,text:''}})).toThrow();
 s=step(s,{type:'resolve'});s=step(s,{type:'handoff'});expect(completed(s)).toBe(false);s=step(s,{type:'switch',role:'buyer'});s=step(s,{type:'handoff'});expect(completed(s)).toBe(true);
 const cancelled=step(verify(),{type:'cancel'});expect(()=>step(cancelled,{type:'handoff'})).toThrow();expect(completed(cancelled)).toBe(false);
});
test('reviews require completed handoff and independent valid submissions',()=>{
 let s=finish();for(const stars of [0,6,1.5])expect(()=>step(s,{type:'review',review:{stars,text:''}})).toThrow();
 s=step(s,{type:'review',review:{stars:5,text:'Good demo'}});expect(s.reviews.seller).toBeUndefined();expect(()=>step(s,{type:'review',review:{stars:1,text:''}})).toThrow();s=step(s,{type:'switch',role:'seller'});s=step(s,{type:'review',review:{stars:4,text:'Thanks'}});expect(Object.keys(s.reviews)).toHaveLength(2);
 const reset=initial('SESSION-B');expect(code(reset)).not.toBe(code(s));expect(reset.history).toHaveLength(1);expect(reset.reviews).toEqual({});expect(reset.descriptions).toEqual({buyer:'',seller:''});
});
