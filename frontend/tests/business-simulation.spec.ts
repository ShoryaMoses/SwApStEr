import {test, expect} from '@playwright/test';
import {act, authorize, compliant, extract, initialize, issues, ranked, sample, suppliers, total} from '../lib/business/simulation';

const decision = () => act(act(initialize(sample), 'horizon', 'advance'), 'horizon', 'advance');
test('initialization, extraction and invalid requests', () => {
  expect(initialize(sample).threads).toHaveLength(3);
  expect(extract('Find 1,000 headphones under $12 each delivered to Texas within 40 days. India', sample)).toMatchObject({quantity:1000,maxUnit:1200,days:40,countries:['India']});
  for (const patch of [{quantity:0},{maxUnit:-10},{maxUnit:NaN},{maxTotal:Infinity},{days:0},{countries:[]}]) expect(()=>initialize({...sample,...patch})).toThrow();
  expect(()=>extract('unsupported request',sample)).toThrow();
});
test('escalation pauses; keep and cancel never authorize', () => {
  const d=decision(), t=d.threads[1];
  expect(t.status).toBe('decision'); expect(t.quote).toBe(1040); expect(t.limit).toBe(1000);
  expect(act(d,t.id,'advance')).toEqual(d);
  expect(act(d,t.id,'approve')).toEqual(d);
  expect(act(d,t.id,'keep').threads[1]).toMatchObject({limit:1000,status:'stopped'});
  expect(act(d,t.id,'cancel').threads[1].status).toBe('stopped');
});
test('authorization is explicit, scoped and never final approval',()=>{
  const d=decision();
  expect(()=>authorize(d,'horizon',1030,null)).toThrow();
  expect(()=>authorize(d,'horizon',-1,null)).toThrow();
  const next=authorize(d,'horizon',1040,null);
  expect(next.threads[1]).toMatchObject({limit:1040,status:'active'});
  expect(next.request.maxUnit).toBe(1000); expect(next.threads[0]).toEqual(d.threads[0]);
  const proposal=act(next,'horizon','advance'); expect(proposal.threads[1].status).toBe('proposed');
  expect(act(proposal,'horizon','approve').threads[1].status).toBe('approved');
  const approved=act(proposal,'horizon','approve');expect(act(approved,'horizon','approve')).toEqual(approved);
});
test('total budget includes shipping and cannot be removed during escalation',()=>{
  let d=initialize({...sample,maxUnit:1100,maxTotal:530000});
  d=act(act(d,'horizon','advance'),'horizon','advance');
  expect(d.threads[1].status).toBe('decision');
  expect(()=>authorize(d,'horizon',1100,null)).toThrow();
  expect(()=>authorize(d,'horizon',1100,535000)).toThrow();
  d=authorize(d,'horizon',1100,540000);
  expect(compliant(d,d.threads[1])).toBe(true);
  expect(total(1040,500,20000)).toBe(540000);
});
test('buyer offers stay bounded; supplier floors hold; transcript excludes private limits',()=>{
  for(const maxUnit of [1,800,1003,1600]) {
    let d=initialize({...sample,maxUnit});
    for(const s of suppliers) for(let i=0;i<5;i++) d=act(d,s.id,'advance');
    for(const t of d.threads) {
      for(const m of t.messages.filter(m=>m.who==='Buyer agent')) {
        if (m.unitPrice !== undefined) expect(m.unitPrice).toBeLessThanOrEqual(maxUnit);
        expect(m.text).not.toMatch(/maximum|budget|limit/i);
      }
      expect(t.quote).toBeGreaterThanOrEqual({pacific:990,horizon:1040,meridian:1020}[t.id]!);
      if(t.status==='proposed') expect(compliant(d,t)).toBe(true);
    }
  }
});
test('hard constraints block proposals and approval',()=>{
  for(const patch of [{days:1},{quantity:1},{quantity:10000},{requirements:'Verified certification'}]) {
    const d=initialize({...sample,...patch});
    expect(issues(d.request,suppliers[0]).length).toBeGreaterThan(0);
    expect(act(d,'pacific','advance').threads[0].status).toBe('stopped');
    expect(act(d,'pacific','approve')).toEqual(d);
  }
});
test('independent pause/resume and comparisons rank total cost, not unit price',()=>{
  let d=initialize({...sample,maxUnit:1100});
  d=act(d,'horizon','advance'); const other=d.threads[0];
  d=act(d,'horizon','pause'); expect(d.threads[1].status).toBe('paused');expect(d.threads[0]).toEqual(other);
  for(const s of suppliers) for(let i=0;i<2;i++)d=act(d,s.id,'advance');
  expect(ranked(d)[0].id).toBe('horizon'); // $5,400 vs Pacific's cheaper unit price but $5,550 total.
  expect(ranked(d)[0].quote).toBeGreaterThan(d.threads[0].quote);
  expect(initialize(sample).threads.every(t=>t.round===0&&t.events.length===0)).toBe(true);
});


test('exact observed history accepts $10.20 after authorization instead of replaying $9.79', () => {
  let d = initialize(sample);
  d.threads[2] = {...d.threads[2], round: 2, quote: 1020, status: 'decision', messages: [
    {who: 'Buyer agent', unitPrice: 1000, text: 'Can you offer $10.00 USD per unit?'},
    {who: 'Supplier agent', unitPrice: 1080, text: 'Proposal: $10.80 USD per unit.'},
    {who: 'Buyer agent', unitPrice: 979, text: 'Can you offer $9.79 USD per unit?'},
    {who: 'Supplier agent', unitPrice: 1020, text: 'Proposal: $10.20 USD per unit.'},
  ]};
  const history = [...d.threads[2].messages];
  for (const limit of [1020, 1500]) {
    const authorized = authorize(d, 'meridian', limit, null);
    expect(authorized.threads[2].messages).toEqual(history);
    expect(authorized.threads[2].status).toBe('active');
    const next = act(authorized, 'meridian', 'advance');
    const t = next.threads[2];
    expect(t).toMatchObject({round: 3, quote: 1020, status: 'proposed'});
    expect(t.messages.slice(0, 4)).toEqual(history);
    expect(t.messages.slice(4)).toHaveLength(1);
    expect(t.messages[4]).toMatchObject({who: 'Buyer agent', unitPrice: 1020});
    expect(t.messages[4].text).toContain('subject to final human approval');
    expect(t.messages[4].text).not.toMatch(/maximum|budget|limit|authorization|15.00/i);
    expect(act(next,'meridian','advance')).toEqual(next);
    expect(next.threads[0]).toEqual(d.threads[0]);
    expect(act(next,'meridian','approve').threads[2].status).toBe('approved');
  }
  expect(act(d,'meridian','advance')).toEqual(d);
  expect(act(d,'meridian','keep').threads[2].limit).toBe(1000);
});

test('counteroffers follow prior bids and latest quotes, never decrease or repeat rejected bids', () => {
  for (const strategy of ['balanced', 'aggressive', 'delivery'] as const) {
    let d=initialize({...sample, strategy});
    for(const s of suppliers) {
      d=act(d,s.id,'advance');
      const first=d.threads.find(t=>t.id===s.id)!;
      const prior=first.messages[0].unitPrice!;
      const counter=first.quote;
      d=act(d,s.id,'advance');
      const second=d.threads.find(t=>t.id===s.id)!;
      const response=second.messages[2];
      if(response.unitPrice !== undefined) {
        expect(response.unitPrice).toBeGreaterThan(prior);
        expect(response.unitPrice).toBeLessThanOrEqual(Math.min(counter,1000));
      } else expect(response.text).toContain('improve your quoted unit price');
    }
  }
});

test('acceptance rechecks shipping budget and hard requirements after authorization', () => {
  const authorized=authorize(decision(),'horizon',1040,null);
  const capped={...authorized,threads:authorized.threads.map(t=>t.id==='horizon'?{...t,totalLimit:530000}:t)};
  expect(act(capped,'horizon','advance').threads[1].status).toBe('decision');
  const incompatible={...authorized,request:{...authorized.request,days:1}};
  expect(act(incompatible,'horizon','advance').threads[1].status).toBe('stopped');
});
