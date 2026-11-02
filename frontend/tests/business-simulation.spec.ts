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
        const offered=Math.round(Number(m.text.match(/\$([\d,.]+)/)![1].replaceAll(',',''))*100);
        expect(offered).toBeLessThanOrEqual(maxUnit);
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
