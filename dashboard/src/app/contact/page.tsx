"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Send, CheckCircle2, AlertCircle, MessageSquare } from "lucide-react";

export default function ContactPage() {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    company: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus("submitting");

    try {
      if (!formData.fullName.trim() || !formData.email.trim() || !formData.message.trim()) {
        throw new Error("Please fill in your name, email, and message.");
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        throw new Error("Please enter a valid email address.");
      }

      const res = await fetch(`${API_BASE}/api/v1/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: formData.fullName.trim(),
          email: formData.email.trim().toLowerCase(),
          company: formData.company.trim(),
          message: formData.message.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to send your message. Please try again.");
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to send your message. Please try again.");
    }
  };

  const inputClass =
    "w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors";

  return (
    <div className="min-h-screen bg-[#020817] text-slate-300 py-12 px-6">
      <div className="w-full max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <Link href="/#footer" className="inline-flex items-center text-sm font-medium text-indigo-400 hover:text-indigo-300 mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 mb-6">
            <MessageSquare className="w-6 h-6 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Contact Us</h1>
          <p className="text-slate-400">Questions, feedback, or need help with your account? Send us a message and we&apos;ll get back to you.</p>
        </div>

        {status === "success" ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Message Sent!</h2>
            <p className="text-slate-400 mb-6">Thank you for reaching out. Our team will respond to you at <span className="text-slate-200">{formData.email}</span> as soon as possible.</p>
            <button
              onClick={() => { setStatus("idle"); setFormData({ fullName: "", email: "", company: "", message: "" }); }}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
            >
              Send Another Message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-slate-900/40 border border-white/10 rounded-2xl p-6 sm:p-8 space-y-5">
            {error && (
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
                <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
                {error}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="fullName">Full Name *</label>
                <input id="fullName" name="fullName" type="text" placeholder="Juan Dela Cruz" value={formData.fullName} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="email">Email Address *</label>
                <input id="email" name="email" type="email" placeholder="you@example.com" value={formData.email} onChange={handleChange} className={inputClass} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="company">Company (optional)</label>
              <input id="company" name="company" type="text" placeholder="Your business name" value={formData.company} onChange={handleChange} className={inputClass} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="message">Message *</label>
              <textarea id="message" name="message" rows={5} placeholder="How can we help you?" value={formData.message} onChange={handleChange} className={`${inputClass} resize-none`} />
            </div>

            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-3 rounded-xl transition-colors"
            >
              {status === "submitting" ? (
                <>Sending...</>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Message
                </>
              )}
            </button>

            <p className="text-xs text-slate-500 text-center">
              Prefer email? Reach us directly at{" "}
              <a href="mailto:support@inventaapi.com" className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                <Mail className="w-3 h-3" /> support@inventaapi.com
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}