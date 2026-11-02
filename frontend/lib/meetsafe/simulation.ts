/** Fictional, in-memory workflow. No authentication, persistence, or network access. */
export type Role = 'buyer' | 'seller';
export type Terms = {location: string; date: string; time: string; instructions: string};
export type Review = {stars: number; text: string};
export const reasons = ['Buyer did not arrive', 'Seller did not arrive', 'Item differs from the listing', 'Item damaged', 'Meeting needs to be rescheduled', 'Other concern'] as const;
export type State = {
  session: string; role: Role; revision: number; terms: Terms | null;
  accepted: Record<Role, boolean>; descriptions: Record<Role, string>;
  revealed: boolean; verified: boolean; handed: Record<Role, boolean>;
  issue: string | null; cancelled: boolean; reviews: Partial<Record<Role, Review>>; history: string[];
};
export function initial(session: string): State {
  return {session, role:'seller', revision:0, terms:null, accepted:{buyer:false,seller:false},
    descriptions:{buyer:'',seller:''}, revealed:false, verified:false, handed:{buyer:false,seller:false}, issue:null, cancelled:false,reviews:{},history:['Fictional $850 VR Headset agreement loaded. No real transaction linked.']};
}
export const scheduled = (s: State) => !!s.terms && s.accepted.buyer && s.accepted.seller;
export const completed = (s: State) => s.verified && s.handed.buyer && s.handed.seller && !s.issue && !s.cancelled;
export const code = (s: State) => `DEMO-${s.session}-${s.revision}`;
export function defaultTerms(now = new Date()): Terms {
  const date = new Date(now); date.setDate(date.getDate()+2);
  return {location:'Public library main entrance (fictional meeting)', date:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,time:'15:00',instructions:'Meet outside in daylight; inspect the headset before confirming.'};
}
export function validateTerms(t: Terms, now: Date) {
  if (!t.location.trim() || t.location.length>160 || t.instructions.length>400) throw new Error('Enter a public location (up to 160 characters) and instructions under 400 characters.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !/^\d{2}:\d{2}$/.test(t.time)) throw new Error('Enter a valid future meeting date and time.');
  const date = new Date(`${t.date}T${t.time}:00`);
  const [y,m,d] = t.date.split('-').map(Number), [h,min] = t.time.split(':').map(Number);
  if (!Number.isFinite(date.getTime()) || date.getFullYear()!==y || date.getMonth()+1!==m || date.getDate()!==d || date.getHours()!==h || date.getMinutes()!==min || date <= now) throw new Error('Enter a valid future meeting date and time.');
}
export type Action = {type:'switch'; role:Role} | {type:'propose'; terms:Terms} | {type:'accept'} |
  {type:'describe'; text:string} | {type:'reveal'} | {type:'redeem'; code:string} |
  {type:'handoff'} | {type:'issue'; reason:string} | {type:'resolve'} | {type:'cancel'} | {type:'review'; review:Review};
export function transition(s:State, a:Action, now=new Date()):State {
  const event=(next:State, message:string) => ({...next,history:[...s.history,`${s.role === 'buyer'?'Buyer':'Seller'}: ${message}`]});
  if(a.type==='switch') return {...s,role:a.role};
  if(s.cancelled) throw new Error('This simulated exchange was cancelled. Reset to start again.');
  if(a.type==='review') {
    if(!completed(s)) throw new Error('Reviews unlock only after both handoff confirmations and issue resolution.');
    if(s.reviews[s.role]) throw new Error('This participant already submitted a simulated review.');
    if(!Number.isInteger(a.review.stars) || a.review.stars<1 || a.review.stars>5 || a.review.text.length>400) throw new Error('Choose 1–5 stars and a review under 400 characters.');
    return event({...s,reviews:{...s.reviews,[s.role]:a.review}},'Submitted a simulated review. No public reputation changed.');
  }
  if(completed(s)) throw new Error('Exchange already completed. Only simulated reviews remain available.');
  if(a.type==='issue') {
    if(!reasons.includes(a.reason as typeof reasons[number])) throw new Error('Select an issue reason.');
    if(s.issue) throw new Error('Resolve the current simulated issue first.');
    return event({...s,issue:a.reason,handed:{buyer:false,seller:false}},`Reported ${a.reason}. Not a support ticket; handoff confirmations cleared.`);
  }
  if(a.type==='resolve') {
    if(!s.issue) throw new Error('No unresolved issue.');
    return event({...s,issue:null},'Simulated issue resolution. Both participants must confirm handoff again.');
  }
  if(a.type==='cancel') return event({...s,cancelled:true},'Cancelled simulated exchange. No real transaction changed.');
  if(a.type==='describe') {
    if(a.text.length>240) throw new Error('Keep the optional description under 240 characters.');
    return event({...s,descriptions:{...s.descriptions,[s.role]:a.text}},'Updated optional fictional recognition details.');
  }
  if(a.type==='propose') {
    validateTerms(a.terms,now);
    return event({...s,terms:{...a.terms,location:a.terms.location.trim()},revision:s.revision+1,
      accepted:{buyer:s.role==='buyer',seller:s.role==='seller'},revealed:false,verified:false,handed:{buyer:false,seller:false}},
      `Proposed ${a.terms.location}, ${a.terms.date} ${a.terms.time} (this browser’s local time). Previous acceptances and code invalidated.`);
  }
  if(a.type==='accept') {
    if(!s.terms) throw new Error('Propose meeting terms first.');
    validateTerms(s.terms,now);
    if(s.accepted[s.role]) return s;
    return event({...s,accepted:{...s.accepted,[s.role]:true}},'Accepted the current pickup terms.');
  }
  if(s.issue) throw new Error('Resolve the simulated issue before verification or handoff.');
  if(!scheduled(s)) throw new Error('Both participants must accept the same pickup terms first.');
  if(a.type==='reveal') {
    if(s.role!=='buyer') throw new Error('Only Buyer View can reveal this demo code.');
    if(s.verified) throw new Error('This code has already been redeemed.');
    if(s.revealed) return s;
    return event({...s,revealed:true},'Revealed a simulated exchange code. It is not proof of identity or delivery.');
  }
  if(a.type==='redeem') {
    if(s.role!=='seller') throw new Error('Only Seller View can redeem this demo code.');
    if(s.verified) throw new Error('This code has already been redeemed.');
    if(!s.revealed || a.code.trim()!==code(s)) throw new Error('Invalid demo code. Ask Demo Buyer to reveal the current code.');
    return event({...s,verified:true},'Simulated code validated once. No physical identity verified.');
  }
  if(a.type==='handoff') {
    if(!s.verified) throw new Error('Complete simulated code verification first.');
    if(s.handed[s.role]) return s;
    return event({...s,handed:{...s.handed,[s.role]:true}},s.role==='buyer'?'Confirmed item received and inspected (simulated).':'Confirmed item handed over (simulated).');
  }
  return s;
}
