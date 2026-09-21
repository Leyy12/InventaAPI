"use client";
import { useState } from 'react';
import { apiExamples } from '@/lib/api-examples';

export default function CodeSnippet({ endpoint = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002'}/daas/v1/catalog` }: { endpoint?: string }) {
  const [language, setLanguage] = useState<'curl' | 'javascript' | 'python' | 'php'>('curl');
  const [message, setMessage] = useState('');
  let examples;
  try { examples = apiExamples(endpoint); } catch { return <p role="alert">API endpoint configuration is unavailable. Contact the operator.</p>; }
  async function copy(text: string, target: string) {
    try { await navigator.clipboard.writeText(text); setMessage(`${target} copied.`); }
    catch { setMessage('Copy failed. Select and copy the text manually.'); }
  }
  return <section className="glass-card rounded-xl border border-slate-700 p-4 space-y-3" aria-label="Integration examples">
    <h3 className="font-semibold text-white">Integration examples</h3>
    <p className="text-xs text-slate-400">Server-side examples only. Replace YOUR_API_KEY with a securely stored key; never publish it in browser code or URLs.</p>
    <div className="flex flex-wrap gap-3"><code className="break-all">{endpoint}</code><button onClick={() => void copy(endpoint, 'Endpoint')} className="text-indigo-300">Copy endpoint</button></div>
    <div className="flex flex-wrap gap-4">{(['curl', 'javascript', 'python', 'php'] as const).map(lang => <button key={lang} aria-pressed={language === lang} onClick={() => setLanguage(lang)} className={language === lang ? 'text-indigo-300' : 'text-slate-400'}>{lang === 'curl' ? 'cURL' : lang === 'php' ? 'PHP' : lang === 'javascript' ? 'JavaScript' : 'Python'}</button>)}</div>
    <pre className="overflow-x-auto bg-slate-950 p-4 text-xs"><code>{examples[language]}</code></pre>
    <button onClick={() => void copy(examples[language], 'Example')} className="text-indigo-300">Copy example</button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
