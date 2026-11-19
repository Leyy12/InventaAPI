"use client";
import { useEffect, useState } from 'react';
import { Check, Code2 } from 'lucide-react';
import { apiExamples } from '@/lib/api-examples';

type Lang = 'curl' | 'javascript' | 'python' | 'php';

const TABS: { id: Lang; tab: string; label: string; file: string }[] = [
  { id: 'curl', tab: 'cURL', label: 'Shell', file: 'request.sh' },
  { id: 'javascript', tab: 'JavaScript', label: 'JavaScript', file: 'catalog.mjs' },
  { id: 'python', tab: 'Python', label: 'Python', file: 'catalog.py' },
  { id: 'php', tab: 'PHP', label: 'PHP', file: 'catalog.php' },
];

const AUTO_NEXT_MS = 6000;

const RUN_HINT: Record<Lang, string> = {
  curl: '# run with `bash request.sh`',
  javascript: '// run with `node catalog.mjs`',
  python: '# run with `python catalog.py`',
  php: '// run with `php catalog.php`',
};

function commentPrefix(lang: Lang) { return lang === 'javascript' || lang === 'php' ? '//' : '#'; }

function isComment(line: string, lang: Lang) { return line.trimStart().startsWith(commentPrefix(lang)); }

export default function IntegrationShowcase({ endpoint = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002'}/daas/v1/catalog`, compact = false }: { endpoint?: string; compact?: boolean }) {
  const [language, setLanguage] = useState<Lang>('curl');
  const [copied, setCopied] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cycle, setCycle] = useState(0);

  // Auto-advance to the next tab; hovering, focusing or copying pauses it.
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => {
      setLanguage(current => TABS[(TABS.findIndex(t => t.id === current) + 1) % TABS.length].id);
      setCycle(c => c + 1);
    }, AUTO_NEXT_MS);
    return () => clearTimeout(id);
  }, [language, paused, cycle]);

  let examples: Record<Lang, string>;
  try { examples = apiExamples(endpoint); } catch { return null; }

  const active = TABS.find(t => t.id === language)!;
  const header = `${commentPrefix(language)} ${active.file}`;
  const body = examples[language];
  // PHP must open with `<?php`, so the file-name comment goes after it.
  const code = language === 'php'
    ? body.replace('<?php\n', `<?php\n${header}\n`) + `\n\n${RUN_HINT[language]}`
    : `${header}\n${body}\n\n${RUN_HINT[language]}`;
  const lines = code.split('\n');

  async function copy() {
    try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  }

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false); }}
      className={`${compact ? 'w-full' : 'mx-auto w-full max-w-3xl'} overflow-hidden rounded-xl border border-slate-700 bg-slate-900/80 shadow-2xl shadow-indigo-500/10`} aria-label="Integration examples">
      <style>{`@keyframes inventa-tab-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
      <div role="tablist" aria-label="Integration language" className="flex overflow-x-auto border-b border-slate-700 px-3">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={language === t.id}
            onClick={() => { setLanguage(t.id); setCycle(c => c + 1); setCopied(false); }}
            className={`relative whitespace-nowrap border-b-2 ${compact ? 'px-2.5 py-2.5' : 'px-3 py-3'} text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${language === t.id ? 'border-indigo-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {t.tab}
            {language === t.id && !paused && (
              <span key={cycle} aria-hidden="true" className="absolute inset-x-0 -bottom-0.5 h-0.5 origin-left bg-purple-300"
                style={{ animation: `inventa-tab-progress ${AUTO_NEXT_MS}ms linear forwards` }} />
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" className={`code-panel !rounded-none !border-0 ${compact ? 'h-64 overflow-auto py-3' : 'overflow-x-auto py-4'} text-left`}>
        <pre className={compact ? 'text-xs leading-5' : 'text-[13px] leading-6'}><code>
          {lines.map((line, i) => (
            <div key={i} className="flex px-4">
              <span aria-hidden="true" className="w-8 shrink-0 select-none pr-4 text-right text-slate-500">{i + 1}</span>
              <span className={isComment(line, language) ? 'text-slate-500' : ''}>{line || ' '}</span>
            </div>
          ))}
        </code></pre>
      </div>

      <div className="flex items-center justify-between border-t border-slate-700 px-4 ${compact ? 'py-2' : 'py-3'}">
        <span className="text-sm text-slate-300">{active.label}</span>
        <button type="button" onClick={() => void copy()}
          className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Code2 className="h-4 w-4" />}
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
      </div>
      <p role="status" className="sr-only">{copied ? 'Example copied to clipboard.' : ''}</p>
    </div>
  );
}
