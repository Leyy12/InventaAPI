"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { createUserWithEmailAndPassword, deleteUser, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { doc, getDocFromServer, setDoc, serverTimestamp } from "@/lib/data/firestore-client";
import { auth, db } from "@/lib/firebase/config";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, KeyRound, AlertCircle, ArrowRight, ArrowLeft, User as UserIcon, Building, Briefcase, Eye, EyeOff, MailCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import PostSignupPlans from "@/components/subscription/PostSignupPlans";
import { customerLoginEntryDestination, rememberCustomerLoginEntry } from '../../../../services/auth-navigation';
import { completeCustomerSignup, readRegistrationPolicy, sendSignupCode, verifySignupCode, confirmSignupEmail, reclaimSignupEmail,
  normalizeSignupEmail, validSignupEmail, PASSWORD_MIN_LENGTH, TERMS_VERSION, VERIFICATION_CODE_TTL_SECONDS } from '../../../../services/customer-registration.mjs';

const BUSINESS_SEGMENTS = [
  "Grocery",
  "Pharmacy",
  "Hardware"
];

// Verification calls the API origin directly so per-IP limits see the real client.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";

function SignupPageInner() {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    businessName: "",
    businessSegment: BUSINESS_SEGMENTS[0],
    termsAccepted: false,
    privacyConsent: false
  });
  const [step, setStep] = useState<"details" | "verify" | "plans">("details");
  // The account is created only for the address a code was sent to and verified for.
  const [codeSentTo, setCodeSentTo] = useState("");
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState<{ email: string; token: string } | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Preserve any pending plan intent from the landing page (e.g. pendingPlan=pro)
  // so after signup the user is immediately taken to the plan chooser.
  const pendingPlan = searchParams.get("pendingPlan");
  // Codes are only sent once every field is filled in and both agreements are accepted.
  const detailsComplete = [formData.fullName, formData.email, formData.password, formData.confirmPassword, formData.businessName]
    .every(value => value.trim() !== "");
  const agreementsAccepted = formData.termsAccepted && formData.privacyConsent;

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds(seconds => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  useEffect(() => {
    if (step === "verify") codeInput.current?.focus();
  }, [step]);

  const sendCode = async (email: string) => {
    setLoading(true);
    try {
      const result = await sendSignupCode({ base: API_BASE, email });
      if (!result.ok) {
        setError(result.message);
        if (result.retryAfterSeconds && email === codeSentTo) setResendSeconds(result.retryAfterSeconds);
        return false;
      }
      setCodeSentTo(email); setVerified(null); setCode("");
      setResendSeconds(result.resendAvailableInSeconds);
      return true;
    } finally {
      setLoading(false);
    }
  };

  // Every detail is checked before a code is sent and again before the account is created,
  // so a rejected form never leaves a Firebase identity behind.
  const detailsError = () => {
    if (!detailsComplete) return "Please fill in every field.";
    if (!validSignupEmail(normalizeSignupEmail(formData.email))) return "Please enter a valid email address.";
    if (formData.password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
    if (formData.password !== formData.confirmPassword) return "Passwords do not match.";
    if (!BUSINESS_SEGMENTS.includes(formData.businessSegment)) return "Please choose a business segment.";
    if (!formData.termsAccepted) return "You must agree to the Terms of Service and Acceptable Use Policy to create an account.";
    if (!formData.privacyConsent) return "You must agree to the Privacy Policy to create an account.";
    return "";
  };

  // Step 1: validate the details, then email a code unless one is already pending for this address.
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    const email = normalizeSignupEmail(formData.email);
    const invalid = detailsError();
    if (invalid) { setError(invalid); return; }

    if (email === codeSentTo || await sendCode(email)) setStep("verify");
  };

  const handleResend = async () => {
    setError("");
    setNotice("");
    if (await sendCode(codeSentTo)) setNotice(`We sent a new code to ${codeSentTo}.`);
  };

  // Step 2: verify the emailed code, then create the account for that exact address.
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    const invalid = detailsError();
    if (invalid || normalizeSignupEmail(formData.email) !== codeSentTo) {
      setError(invalid || "Your email changed. Go back and request a new code.");
      setLoading(false);
      return;
    }

    try {
      // Codes are single-use; a retry after a later failure reuses this address's token.
      let verificationToken = verified?.email === codeSentTo ? verified.token : "";
      if (!verificationToken) {
        const verification = await verifySignupCode({ base: API_BASE, email: codeSentTo, code });
        if (!verification.ok) { setError(verification.message); return; }
        verificationToken = verification.verificationToken;
        setVerified({ email: codeSentTo, token: verificationToken });
      }
      const result = await completeCustomerSignup({
        canRegister: readRegistrationPolicy,
        createUser: async () => (await createUserWithEmailAndPassword(auth, codeSentTo, formData.password)).user,
        confirmEmail: (user: User) => confirmSignupEmail({ base: API_BASE, user, verificationToken }),
        // A previous attempt that stopped after creating the identity is cleared, then retried.
        reclaimEmail: () => reclaimSignupEmail({ base: API_BASE, email: codeSentTo, verificationToken }),
        profileExists: async (user: User) => (await getDocFromServer(doc(db, 'users', user.uid))).exists(),
        deleteUser,
        signOut: () => signOut(auth),
        writeProfile: (user: User) => setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        fullName: formData.fullName,
        email: user.email,
        businessName: formData.businessName,
        businessSegment: formData.businessSegment,
        plan: "Free",
        role: "Developer",  // All signups are Developer role
        apiRequestLimit: 50,
        apiRequestsUsed: 0,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        termsAccepted: true,
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: serverTimestamp(),
        privacyConsent: true,
        privacyConsentTimestamp: serverTimestamp()
        }),
      });
      if (!result.ok) { setError(result.message); return; }
      // The committed account signs in again as an ordinary login, so the session is
      // verified against the stored profile. It then chooses a plan before the dashboard.
      try {
        await signInWithEmailAndPassword(auth, codeSentTo, formData.password);
        rememberCustomerLoginEntry('free');
        setStep("plans");
        return;
      } catch {
        // Fall back to the landing login. Only a valid paid CTA keeps its upgrade intent.
      }
      const intent = new URLSearchParams({ registered: 'true' });
      if (pendingPlan === 'pro' || pendingPlan === 'pro_max') {
        intent.set('choosePlan', 'true'); intent.set('pendingPlan', pendingPlan);
      }
      const redirectUrl = customerLoginEntryDestination(intent);
      router.push(redirectUrl);
    } catch {
      setError('Account setup is unavailable. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const spinner = (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
  );

  if (step === "plans") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <PostSignupPlans initialPlan={pendingPlan === "pro" || pendingPlan === "pro_max" ? pendingPlan : null} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-6">
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      
      <div className="w-full max-w-xl glass-card rounded-2xl p-5 sm:p-6 relative z-10 shadow-2xl">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center mb-2">
            <Image
              src="/inventa-logo.png"
              alt="InventaAPI Logo"
              width={64}
              height={64}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Create an Account</h1>
          <p className="text-slate-400 text-sm mt-1">Join InventaAPI to manage your centralized product data</p>
          <p className="text-xs font-medium text-indigo-400 mt-2">
            {step === "details" ? "Step 1 of 2 · Account details" : "Step 2 of 2 · Verify your email"}
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={step === "details" ? handleSendCode : handleSignup} className="space-y-3">
          {step === "details" ? (
            <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="fullName" className="text-sm font-medium text-slate-300 ml-1">Full Name</label>
              <div className="relative">
                <UserIcon className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  id="fullName"
                  type="text" 
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
                  placeholder="Juan dela Cruz"
                />
              </div>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="email" className="text-sm font-medium text-slate-300 ml-1">Email Address</label>
              <div className="relative">
                <Mail className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  id="email"
                  type="email" 
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                  aria-describedby="email-hint"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
                  placeholder="developer@example.com"
                />
              </div>
              <p id="email-hint" className="text-xs text-slate-500 ml-1">We&apos;ll email a 6-digit code to confirm this address is yours before creating your account.</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-slate-300 ml-1">Password</label>
              <div className="relative">
                <KeyRound className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  id="password"
                  type={showPassword ? "text" : "password"} 
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  minLength={6}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-11 pr-11 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-300 ml-1">Confirm Password</label>
              <div className="relative">
                <KeyRound className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"} 
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  minLength={6}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-11 pr-11 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="businessName" className="text-sm font-medium text-slate-300 ml-1">Business Name</label>
              <div className="relative">
                <Building className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  id="businessName"
                  type="text" 
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleChange}
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
                  placeholder="e.g. JD Hardware"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="businessSegment" className="text-sm font-medium text-slate-300 ml-1">Business Segment</label>
              <div className="relative">
                <Briefcase className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <select 
                  id="businessSegment"
                  name="businessSegment"
                  value={formData.businessSegment}
                  onChange={handleChange}
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-11 pr-10 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all appearance-none cursor-pointer"
                >
                  {BUSINESS_SEGMENTS.map(segment => (
                    <option key={segment} value={segment}>{segment}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex items-center h-5">
              <input
                id="termsAccepted"
                name="termsAccepted"
                type="checkbox"
                checked={formData.termsAccepted}
                onChange={handleChange}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/50 focus:ring-offset-0 transition-all cursor-pointer"
              />
            </div>
            <label htmlFor="termsAccepted" className="text-sm text-slate-400 cursor-pointer select-none">
              I have read and agree to the <Link href="/terms-of-service" target="_blank" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors">Terms of Service and Acceptable Use Policy</Link>, including the rules for API keys, rate limits and permitted use of catalog data.
            </label>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex items-center h-5">
              <input
                id="privacyConsent"
                name="privacyConsent"
                type="checkbox"
                checked={formData.privacyConsent}
                onChange={handleChange}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/50 focus:ring-offset-0 transition-all cursor-pointer"
              />
            </div>
            <label htmlFor="privacyConsent" className="text-sm text-slate-400 cursor-pointer select-none">
              I have read and agree to the <Link href="/privacy-policy" target="_blank" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors">Privacy Policy</Link>. I understand my data will be processed in accordance with RA 10173.
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !detailsComplete || !agreementsAccepted}
            aria-describedby={!detailsComplete || !agreementsAccepted ? "send-code-hint" : undefined}
            className="w-full py-3 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-sm font-medium text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:hover:bg-indigo-500 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                {spinner}
                Sending Code...
              </span>
            ) : (
              <>
                Send Verification Code
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
          {(!detailsComplete || !agreementsAccepted) && (
            <p id="send-code-hint" className="text-center text-xs text-slate-400">
              {!detailsComplete
                ? "Fill in every field above to continue."
                : "Agree to the Terms of Service and the Privacy Policy to continue."}
            </p>
          )}
            </>
          ) : (
            <>
          <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-3 text-slate-300 text-sm">
            <MailCheck className="w-5 h-5 flex-shrink-0 mt-0.5 text-indigo-400" />
            <p>
              Enter the 6-digit code we sent to <span className="font-medium text-white break-all">{codeSentTo}</span>.{" "}
              {/* One literal: the production build drops the space after a constant-folded expression. */}
              {`It expires in ${VERIFICATION_CODE_TTL_SECONDS / 60} minutes. If you don't see it, check your Spam or Promotions folder.`}
            </p>
          </div>

          {notice && <p role="status" className="text-sm text-emerald-400 ml-1">{notice}</p>}

          <div className="space-y-1.5">
            <label htmlFor="verificationCode" className="text-sm font-medium text-slate-300 ml-1">Verification Code</label>
            <div className="relative">
              <ShieldCheck className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={codeInput}
                id="verificationCode"
                type="text"
                name="verificationCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-200 tracking-[0.4em] focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
                placeholder="000000"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full py-3 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-sm font-medium text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                {spinner}
                Creating Account...
              </span>
            ) : (
              <>
                Verify &amp; Create Account
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="flex items-center justify-between gap-3 text-sm">
            <button
              type="button"
              onClick={() => { setStep("details"); setError(""); setNotice(""); }}
              disabled={loading}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              Edit details
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={loading || resendSeconds > 0}
              className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors disabled:text-slate-500 disabled:cursor-not-allowed"
            >
              {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}
            </button>
          </div>
            </>
          )}
        </form>

        <p className="text-center text-sm text-slate-500 mt-4">
          Already have an account? <Link href={customerLoginEntryDestination(new URLSearchParams(
                pendingPlan === "pro" || pendingPlan === "pro_max" ? { pendingPlan } : {}
              ))} className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">Login</Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}
