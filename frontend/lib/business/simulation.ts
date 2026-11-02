/** Browser-only fictional model. No network, storage, orders, or real supplier data. */
export type Request = {
  product: string; description: string; quantity: number; maxUnit: number; maxTotal: number | null;
  destination: string; days: number; countries: string[]; preferences: string; requirements: string;
  strategy: 'balanced' | 'aggressive' | 'delivery';
};
export const sample: Request = {product: 'Wireless headphones', description: 'Over-ear wireless headphones', quantity: 500,
  maxUnit: 1000, maxTotal: null, destination: 'Arizona, United States', days: 45,
  countries: ['China', 'Vietnam', 'India'], preferences: 'Consistent quality', requirements: '', strategy: 'balanced'};
export const suppliers = [
  {id: 'pacific', name: 'Pacific Audio Works', country: 'China', source: 'Simulated Global Supply Directory', ask: 1200, shipping: 60000, days: 30, moq: 100, capacity: 5000, quality: 'Illustrative sample inspection: 92/100'},
  {id: 'horizon', name: 'Horizon Device Collective', country: 'Vietnam', source: 'Simulated Regional Trade Network', ask: 1080, shipping: 20000, days: 35, moq: 200, capacity: 3000, quality: 'Illustrative sample inspection: 95/100'},
  {id: 'meridian', name: 'Meridian Sound Studio', country: 'India', source: 'Simulated Independent Distributor', ask: 1120, shipping: 45000, days: 28, moq: 100, capacity: 4000, quality: 'Illustrative sample inspection: 90/100'},
] as const;
export type Supplier = typeof suppliers[number];
// Hidden from UI/transcripts, but not secret: all simulation code is downloadable.
const minimums: Record<string, number> = {pacific: 990, horizon: 1040, meridian: 1020};
export type Status = 'ready' | 'active' | 'paused' | 'decision' | 'proposed' | 'stopped' | 'approved' | 'rejected';
export type Thread = {id: string; status: Status; round: number; quote: number; limit: number; totalLimit: number | null;
  messages: {who: 'Buyer agent' | 'Supplier agent'; text: string; original?: string; unitPrice?: number}[]; events: string[]};
export type Demo = {request: Request; threads: Thread[]};
export const money = (cents: number) => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(cents / 100);
export const total = (price: number, quantity: number, shipping: number) => price * quantity + shipping;
export function validate(r: Request) {
  if (!r.product.trim() || !r.destination.trim()) throw new Error('Enter a product and shipping destination.');
  if (!Number.isInteger(r.quantity) || r.quantity < 1 || r.quantity > 100000) throw new Error('Quantity must be 1–100,000 whole units.');
  if (!Number.isInteger(r.maxUnit) || r.maxUnit <= 0 || r.maxUnit > 100000000) throw new Error('Enter a positive unit limit, up to $1,000,000.');
  if (r.maxTotal !== null && (!Number.isSafeInteger(r.maxTotal) || r.maxTotal <= 0 || r.maxTotal > 10000000000000)) throw new Error('Enter a valid positive total budget.');
  if (!Number.isInteger(r.days) || r.days < 1 || r.days > 365) throw new Error('Delivery must be 1–365 whole days.');
  if (!r.countries.length) throw new Error('Select at least one country.');
}
export function initialize(request: Request): Demo {
  validate(request);
  return {request: {...request, countries: [...request.countries]}, threads: suppliers.filter(s => request.countries.includes(s.country)).map(s => ({id: s.id, status: 'ready', round: 0, quote: s.ask, limit: request.maxUnit, totalLimit: request.maxTotal, messages: [], events: []}))};
}
export function issues(r: Request, s: Supplier) {
  return [r.quantity < s.moq ? `Minimum order: ${s.moq}` : '', r.quantity > s.capacity ? `Capacity: ${s.capacity}` : '', r.days < s.days ? `Delivery requires ${s.days} days` : '', r.requirements.trim() ? 'Custom non-negotiable requirements are unverified; clear them only if genuinely optional for this simulation.' : ''].filter(Boolean);
}
export function compliant(d: Demo, t: Thread) {
  const s = suppliers.find(s => s.id === t.id)!;
  return !issues(d.request, s).length && t.quote <= t.limit && (t.totalLimit === null || total(t.quote, d.request.quantity, s.shipping) <= t.totalLimit);
}
export type Action = 'advance' | 'pause' | 'keep' | 'cancel' | 'approve' | 'reject' | 'further';
export function act(d: Demo, id: string, action: Action): Demo {
  return {...d, threads: d.threads.map(t => {
    if (t.id !== id) return t;
    const s = suppliers.find(s => s.id === id)!;
    if (action === 'cancel' && !['approved', 'rejected', 'stopped'].includes(t.status)) return {...t, status: 'stopped', events: [...t.events, 'User cancelled. No agreement created.']};
    if (action === 'pause' && t.status === 'active') return {...t, status: 'paused'};
    if (action === 'keep' && t.status === 'decision') return {...t, status: 'stopped', events: [...t.events, 'Original authorization retained. Supplier declined further concessions.']};
    if (action === 'approve' && t.status === 'proposed' && compliant(d, t)) return {...t, status: 'approved', events: [...t.events, 'Human approved simulated proposal only.']};
    if (action === 'reject' && t.status === 'proposed') return {...t, status: 'rejected'};
    if (action === 'further' && t.status === 'proposed') return {...t, events: [...t.events, 'Supplier declined further concessions. Existing proposal remains available.']};
    if (action !== 'advance' || !['ready', 'active', 'paused'].includes(t.status)) return t;
    if (issues(d.request, s).length) return {...t, status: 'stopped', events: [...t.events, ...issues(d.request, s)]};
    const round = t.round + 1;
    const acceptance = (quote: number): Thread['messages'][number] => ({
      who: 'Buyer agent', unitPrice: quote,
      text: `Accept ${money(quote)} USD per unit for ${d.request.quantity} units on the quoted shipping and delivery terms, subject to final human approval. No order is placed.`,
    });
    // A final outstanding counter remains valid after authorization. Accept its
    // actual terms, not the new spending ceiling, without inventing another bid.
    if (t.round >= 2 && compliant(d, t) && t.quote >= minimums[id]) {
      return {...t, round, status: 'proposed', messages: [...t.messages, acceptance(t.quote)]};
    }
    const ceiling = Math.min(t.limit, t.totalLimit === null ? t.limit : Math.floor((t.totalLimit - s.shipping) / d.request.quantity));
    if (ceiling <= 0) return {...t, status: 'decision', events: [...t.events, 'Shipping alone exhausts the authorized total.']};
    const priorOffers = t.messages.filter(m => m.who === 'Buyer agent' && m.unitPrice !== undefined).map(m => m.unitPrice!);
    const prior = priorOffers.length ? Math.max(...priorOffers) : null;
    // First bid discounts the outstanding quote. Later bids close part of the
    // remaining gap without retracting or repeating a previously rejected bid.
    const candidate = prior === null
      ? Math.floor(t.quote * (d.request.strategy === 'aggressive' ? .9 : .96))
      : prior + Math.max(1, Math.ceil((t.quote - prior) * (d.request.strategy === 'aggressive' ? .25 : .5)));
    const offer = Math.min(ceiling, candidate, t.quote);
    const buyer: Thread['messages'][number] = prior === null || offer > prior
      ? {who: 'Buyer agent', unitPrice: offer, text: `${prior === null ? 'Can you offer' : 'In response to your counter, I can offer'} ${money(offer)} USD per unit for ${d.request.quantity} units?`}
      : {who: 'Buyer agent', text: 'Can you improve your quoted unit price with the same quantity, shipping and delivery terms?'};
    const quote = Math.max(minimums[id], Math.min(t.quote, round === 1 ? s.ask - 40 : minimums[id]));
    const text = `Proposal: ${money(quote)} USD per unit × ${d.request.quantity}; shipping ${money(s.shipping)} USD; delivery ${s.days} days to ${d.request.destination}.`;
    const next: Thread = {...t, round, quote, messages: [...t.messages, buyer,
      {who: 'Supplier agent', unitPrice: quote, text, ...(id === 'pacific' ? {original: `报价：每件 ${money(quote)} USD，数量 ${d.request.quantity}；运费 ${money(s.shipping)} USD；交付 ${s.days} 天。`} : {})}], status: round < 2 ? 'active' : 'decision'};
    if (round >= 2 && compliant(d, next)) {
      next.status = 'proposed';
      next.messages.push(acceptance(quote));
    }
    return next;
  })};
}
export function authorize(d: Demo, id: string, limit: number, totalLimit: number | null): Demo {
  const t = d.threads.find(t => t.id === id);
  if (!t || t.status !== 'decision') return d;
  validate({...d.request, maxUnit: limit, maxTotal: totalLimit});
  if (limit < t.limit || (t.totalLimit !== null && (totalLimit === null || totalLimit < t.totalLimit))) throw new Error('An increase cannot remove or reduce an existing authorization.');
  if (limit === t.limit && totalLimit === t.totalLimit) throw new Error('Enter an increased limit.');
  const updated = {...t, limit, totalLimit};
  if (!compliant(d, updated)) throw new Error('Both unit and total limits must cover the proposal. Other hard constraints still apply.');
  return {...d, threads: d.threads.map(v => v.id !== id ? v : {...updated, status: 'active', events: [...t.events,
    `Explicit authorization: unit ${money(t.limit)} → ${money(limit)}; total ${t.totalLimit === null ? 'unspecified' : money(t.totalLimit)} → ${totalLimit === null ? 'unspecified' : money(totalLimit)}. This supplier only; not purchase approval.`]})};
}
export function ranked(d: Demo) {
  return d.threads.filter(t => ['proposed', 'approved'].includes(t.status) && compliant(d, t)).sort((a, b) => {
    const sa = suppliers.find(s => s.id === a.id)!, sb = suppliers.find(s => s.id === b.id)!;
    return (d.request.strategy === 'delivery' ? sa.days - sb.days : 0) || total(a.quote, d.request.quantity, sa.shipping) - total(b.quote, d.request.quantity, sb.shipping);
  });
}
export function extract(text: string, previous: Request): Request {
  const match = text.match(/find\s+([\d,]+)\s+(.+?)\s+(?:under|for under)\s+\$([\d,.]+)/i);
  if (!match) throw new Error('Supported format: Find 500 wireless headphones under $10 each, delivered to Arizona within 45 days. Edit the structured fields for other requests.');
  const days = text.match(/within\s+(\d+)\s+days/i);
  const destination = text.match(/delivered to\s+(.+?)\s+within/i);
  const countries = ['China', 'Vietnam', 'India'].filter(c => text.toLowerCase().includes(c.toLowerCase()));
  return {...previous, product: match[2], quantity: Number(match[1].replaceAll(',', '')), maxUnit: Math.round(Number(match[3].replaceAll(',', '')) * 100), ...(days ? {days: Number(days[1])} : {}), ...(destination ? {destination: destination[1]} : {}), ...(countries.length ? {countries} : {})};
}
