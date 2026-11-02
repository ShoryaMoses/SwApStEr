import Link from 'next/link';
import MeetSafeDemo from './meetsafe-demo';
export default function MeetSafePage() {
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <div className="sticky top-0 z-20 border-b border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-semibold text-blue-900">Interactive simulated preview — no real meetup, exchange, payment, or review is recorded.</div>
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8"><Link prefetch={false} href="/" className="font-bold text-blue-700">← Back to SwApStEr</Link><MeetSafeDemo/></div>
  </main>;
}
