import Link from "next/link";
import { ArrowLeft, Scale, FileCheck, Shield, CreditCard, Ban, Globe, UserCheck, ShieldAlert, TriangleAlert, Images } from "lucide-react";

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
          <h1 className="text-3xl font-bold text-white mb-2">Terms of Service &amp; Acceptable Use Policy</h1>
          {/* Keep the version equal to TERMS_VERSION in services/customer-registration.mjs. */}
          <p className="text-slate-400">Last updated: October 20, 2026 · Version 2026-10-20</p>
        </div>

        <div className="prose prose-invert prose-indigo max-w-none">
          <p className="lead text-lg text-slate-300">
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of the InventaAPI Sales &amp; Inventory
            Data-as-a-Service platform (the &quot;Service&quot;), operated by the InventaAPI Research Team. The Acceptable Use
            Policy in Section 4 is part of these Terms. By creating an account or using the Service, you agree to be bound by these Terms.
          </p>

          <hr className="border-slate-800 my-8" />

          <div className="space-y-8">
            <section>
              <div className="flex items-center gap-3 mb-4">
                <FileCheck className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">1. Acceptance of Terms</h2>
              </div>
              <p>By registering for an account, accessing the dashboard, or making any API request, you acknowledge that you have read, understood, and agree to these Terms, our <Link href="/privacy-policy" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">Privacy Policy</Link>, and any applicable laws. If you do not agree, you must discontinue use of the Service immediately.</p>
              <p className="mt-4">You accept these Terms by ticking the agreement box when you create your account. We record the version you accepted and when you accepted it.</p>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <UserCheck className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">2. Registration &amp; Email Verification</h2>
              </div>
              <ul className="list-disc pl-5 space-y-2 mt-4 text-slate-400">
                <li><strong className="text-slate-300">Eligibility:</strong> You must be legally able to enter into a binding agreement and, if you register on behalf of a business, be authorized to act for it.</li>
                <li><strong className="text-slate-300">Your Email Address:</strong> You must register with an email address that you own and can access. Before your account is created, we send a one-time 6-digit verification code to that address. The code expires after 10 minutes, and your account is created only after the correct code is entered. We may limit how often codes can be requested.</li>
                <li><strong className="text-slate-300">Accurate Information:</strong> Your full name, business name, and business segment must be accurate, and you must keep them up to date.</li>
                <li><strong className="text-slate-300">One Identity per Account:</strong> You may not register with another person&apos;s email address, or create additional accounts to evade plan limits, suspensions, or the one-time Free Trial.</li>
                <li><strong className="text-slate-300">Notices:</strong> We send account, security, and billing notices to your verified email address.</li>
              </ul>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <CreditCard className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">3. Accounts, Subscriptions &amp; Billing</h2>
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
                <h2 className="text-xl font-semibold text-white m-0">4. Acceptable Use Policy</h2>
              </div>
              <p>This policy applies to the dashboard, the API, your API keys, and any data you obtain through the Service. You may use the Service and its catalog data to operate your own business applications, such as point-of-sale, inventory, e-commerce, or internal reporting systems. You agree NOT to use the Service to:</p>
              <ul className="list-disc pl-5 space-y-2 mt-4 text-slate-400">
                <li>Violate any applicable law or the rights of third parties.</li>
                <li>Exceed your plan&apos;s documented rate limits or attempt to circumvent our security, rate limiting, quotas, or access controls.</li>
                <li>Resell, sublicense, or share your API keys with unauthorized parties, or expose them in public code, websites, or repositories.</li>
                <li>Use the Service to build competing data services or to scrape data for purposes outside its intended use.</li>
                <li>Introduce malicious code, attempt denial-of-service attacks, or probe the infrastructure in an unauthorized manner.</li>
                <li>Submit false, misleading, infringing, or unlawful product information, images, or requests.</li>
                <li>Impersonate any person or business, or misrepresent your affiliation with them.</li>
                <li>Use automated means or multiple accounts to abuse verification codes, the Free Trial, or other limits.</li>
              </ul>
              <p className="mt-4">If you discover a security issue or suspected misuse, report it through our <Link href="/contact" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">Contact page</Link>.</p>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <ShieldAlert className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">5. Suspension &amp; Termination</h2>
              </div>
              <ul className="list-disc pl-5 space-y-2 mt-4 text-slate-400">
                <li>We may revoke API keys, or suspend or close accounts, that violate these Terms or the Acceptable Use Policy, or that put the Service or other customers at risk. Where practicable, we will notify you at your verified email address.</li>
                <li>You may stop using the Service at any time and request deletion of your account from the Privacy settings in your dashboard.</li>
                <li>Provisions that by their nature should continue, such as the disclaimers and limitation of liability, survive termination.</li>
              </ul>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">6. Data &amp; Privacy</h2>
              </div>
              <p>
                Your personal data is handled in accordance with our Privacy Policy and the Republic Act No. 10173
                (Data Privacy Act of 2012). Product data provided through the Service is intended for business use;
                you are responsible for ensuring your own compliance with applicable laws when handling such data.
              </p>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <TriangleAlert className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">7. Disclaimers &amp; Limitation of Liability</h2>
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
                <h2 className="text-xl font-semibold text-white m-0">8. Governing Law &amp; Changes</h2>
              </div>
              <p>
                These Terms are governed by the laws of the Republic of the Philippines. We may update these Terms
                from time to time; material changes will be reflected on this page with an updated &quot;Last updated&quot;
                date and version. Continued use of the Service after changes constitutes acceptance of the revised Terms.
              </p>
              <p className="mt-4">
                For questions about these Terms, reach out via our <Link href="/contact" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">Contact page</Link> or email{" "}
                <a href="mailto:support@inventaapi.com" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">support@inventaapi.com</a>.
              </p>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4">
                <Images className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-white m-0">9. Product Images &amp; Credits</h2>
              </div>
              <p>
                Some product photos in the catalog come from{" "}
                <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">Open Food Facts</a>,
                a free, collaborative database of food products. These photos are © Open Food Facts contributors and are used under the{" "}
                <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">Creative Commons Attribution-ShareAlike 3.0</a>{" "}
                license. They may have been resized or converted for display.
              </p>
              <p className="mt-4">
                If you reuse or redistribute these photos, you must follow that license, including crediting Open Food Facts and its
                contributors. Product names, brands and logos shown in photos belong to their respective owners. Other product images
                are provided by InventaAPI or by the businesses that submitted the products.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}