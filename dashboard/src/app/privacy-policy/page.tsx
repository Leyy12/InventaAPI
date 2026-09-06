import Link from "next/link";
import { ArrowLeft, Shield, FileText, Database, Lock } from "lucide-react";

export default function PrivacyPolicyPage() {
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
            <Shield className="w-6 h-6 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-slate-400">Last updated: August 2026</p>
        </div>

        <div className="prose prose-invert prose-indigo max-w-none">
          <p className="lead text-lg text-slate-300">
            InventaAPI is committed to protecting your privacy and handling your data in an open and transparent manner. This Privacy Policy explains how we collect, use, and protect your personal information in compliance with the Republic Act No. 10173, also known as the Data Privacy Act of 2012 (DPA).
          </p>

          <hr className="border-slate-800 my-8" />

          <div className="space-y-8">
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Database className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">1. Information We Collect</h2>
              </div>
              <p>We only collect the minimal amount of information necessary to provide our API services to you:</p>
              <ul className="list-disc pl-5 space-y-2 mt-4 text-slate-400">
                <li><strong className="text-slate-300">Account Information:</strong> Your full name, email address, and encrypted password.</li>
                <li><strong className="text-slate-300">Business Profile:</strong> Your business name and business segment (e.g., Grocery, Hardware).</li>
                <li><strong className="text-slate-300">Usage Data:</strong> API request logs, API keys generated, and timestamps of your logins and logouts for security auditing.</li>
                <li><strong className="text-slate-300">Crowdsourced Data:</strong> Any product requests you submit to our catalog.</li>
              </ul>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <FileText className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">2. How We Use Your Data</h2>
              </div>
              <p>The information we collect is used strictly for the following purposes:</p>
              <ul className="list-disc pl-5 space-y-2 mt-4 text-slate-400">
                <li>To authenticate your access to the InventaAPI Dashboard and API services.</li>
                <li>To monitor API rate limits (e.g., your 50 daily requests on the Free tier).</li>
                <li>To notify you about changes to your account, subscription status, or product requests.</li>
                <li>To maintain an audit trail of system access for security purposes.</li>
              </ul>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <Lock className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">3. Data Protection & Rights</h2>
              </div>
              <p>Under the Data Privacy Act of 2012, you possess several rights regarding your personal data:</p>
              <ul className="list-disc pl-5 space-y-2 mt-4 text-slate-400">
                <li><strong className="text-slate-300">Right to Access:</strong> You can download a complete JSON export of all your personal data directly from the Privacy settings in your dashboard.</li>
                <li><strong className="text-slate-300">Right to Erasure:</strong> You can request the deletion of your account. This will immediately revoke your API keys and mark your account data for permanent deletion from our active databases.</li>
                <li><strong className="text-slate-300">Right to Be Informed:</strong> We will never sell your personal data to third parties. Your data is stored securely using enterprise-grade encryption.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
