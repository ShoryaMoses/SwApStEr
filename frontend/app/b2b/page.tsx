import Link from 'next/link';
import BusinessDemo from './business-demo';

export default function BusinessPage() {
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <div className="sticky top-0 z-20 border-b border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-semibold text-blue-900">Interactive Business Preview — Simulated suppliers and negotiations</div>
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4"><Link prefetch={false} href="/" className="font-bold text-blue-700">← Back to SwApStEr</Link><span className="text-sm text-slate-500">Independent representation. Human control.</span></header>
      <BusinessDemo/>
    </div>
  </main>;
}
