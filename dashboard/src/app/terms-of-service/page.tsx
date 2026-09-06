import Link from "next/link";
import { ArrowLeft, Scale, FileCheck, Shield, CreditCard, Ban, Globe } from "lucide-react";

export default function TermsOfServicePage() {
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
            <Scale className="w-6 h-6 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
          <p className="text-slate-400">Last updated: August 2026</p>
        </div>

        <div className="prose prose-invert prose-indigo max-w-none">
          <p className="lead text-lg text-slate-300">
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of the InventaAPI Sales &amp; Inventory
            Data-as-a-Service platform (the &quot;Service&quot;), operated by the InventaAPI Research Team. By creating an
            account or using the Service, you agree to be bound by these Terms.
          </p>

          <hr className="border-slate-800 my-8" />

          <div className="space-y-8">
            <section>
              <div className="flex items-center gap-3 mb-4">
                <FileCheck className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">1. Acceptance of Terms</h2>
              </div>
              <p>By registering for an account, accessing the dashboard, or making any API request, you acknowledge that you have read, understood, and agree to these Terms, our <Link href="/privacy-policy" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">Privacy Policy</Link>, and any applicable laws. If you do not agree, you must discontinue use of the Service immediately.</p>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <CreditCard className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">2. Accounts, Subscriptions &amp; Billing</h2>
              </div>
              <ul className="list-disc pl-5 space-y-2 mt-4 text-slate-400">
                <li><strong className="text-slate-300">Account Responsibility:</strong> You are responsible for safeguarding your account credentials and all activity performed under your account.</li>
                <li><strong className="text-slate-300">Plans:</strong> The Service offers Free and paid subscription plans (e.g., Pro, Enterprise). Features, API rate limits, and pricing for each plan are displayed on the pricing page and may change from time to time.</li>
                <li><strong className="text-slate-300">Payments:</strong> Paid subscriptions are processed by a third-party payment processor (PayMongo). We do not store your card details.</li>
                <li><strong className="text-slate-300">Cancellation &amp; Refunds:</strong> You must cancel before the next billing cycle to avoid further charges. Unless required by law, subscription fees are non-refundable once the billing period begins.</li>
                <li><strong className="text-slate-300">Downgrade:</strong> Upon cancellation or expiry, your account reverts to the Free tier and its applicable limits.</li>
              </ul>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <Ban className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">3. Acceptable Use</h2>
              </div>
              <p>You agree NOT to use the Service to:</p>
              <ul className="list-disc pl-5 space-y-2 mt-4 text-slate-400">
                <li>Violate any applicable law or the rights of third parties.</li>
                <li>Exceed your plan&apos;s documented rate limits or attempt to circumvent our security, rate limiting, or access controls.</li>
                <li>Resell, sublicense, or share your API keys with unauthorized parties.</li>
                <li>Use the Service to build competing data services or to scrape data for purposes outside its intended use.</li>
                <li>Introduce malicious code, attempt denial-of-service attacks, or probe the infrastructure in an unauthorized manner.</li>
              </ul>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">4. Data &amp; Privacy</h2>
              </div>
              <p>
                Your personal data is handled in accordance with our Privacy Policy and the Republic Act No. 10173
                (Data Privacy Act of 2012). Product data provided through the Service is intended for business use;
                you are responsible for ensuring your own compliance with applicable laws when handling such data.
              </p>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <Ban className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">5. Disclaimers &amp; Limitation of Liability</h2>
              </div>
              <ul className="list-disc pl-5 space-y-2 mt-4 text-slate-400">
                <li>The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, whether express or implied.</li>
                <li>We do not warrant that the Service will be uninterrupted, error-free, or that the data provided is fully accurate, complete, or current.</li>
                <li>To the maximum extent permitted by law, InventaAPI shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.</li>
              </ul>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <Globe className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">6. Governing Law &amp; Changes</h2>
              </div>
              <p>
                These Terms are governed by the laws of the Republic of the Philippines. We may update these Terms
                from time to time; material changes will be reflected on this page with an updated &quot;Last updated&quot;
                date. Continued use of the Service after changes constitutes acceptance of the revised Terms.
              </p>
              <p className="mt-4">
                For questions about these Terms, reach out via our <Link href="/contact" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">Contact page</Link> or email{" "}
                <a href="mailto:support@inventaapi.com" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">support@inventaapi.com</a>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}