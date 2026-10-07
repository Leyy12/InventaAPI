import './globals.css';
import Link from 'next/link';

export default function GlobalNotFound() {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-50 font-sans antialiased">
        <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-3xl font-semibold">404 — Page not found</h1>
          <p className="text-slate-400">This page could not be found.</p>
          <Link href="/" className="text-indigo-300 underline focus-visible:ring-2 focus-visible:ring-indigo-300">Return to home</Link>
        </main>
      </body>
    </html>
  );
}
