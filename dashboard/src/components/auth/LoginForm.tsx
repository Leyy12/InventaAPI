"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { signInWithEmailAndPassword, signOut } from "@/lib/supabase-auth";
import { doc, getDocFromServer } from "@/lib/data/firestore-client";
import { auth, db } from "@/lib/firebase/config";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff, MailCheck, ShieldCheck } from "lucide-react";
import type { PlanId } from "@/config/plans";
import { profileRole, adminLoginDestination, rememberCustomerLoginEntry, customerSignupDestination } from '../../../../services/auth-navigation';
import { readSubscription } from '@/lib/subscription';
import { sendPasswordResetCode, resetPasswordWithCode, normalizeSignupEmail, validSignupEmail, validNewPassword,
  PASSWORD_MIN_LENGTH, VERIFICATION_CODE_TTL_SECONDS } from '../../../../services/customer-registration.mjs';

interface LoginFormProps {
  onComplete: () => void;
  onStart?: () => void;
  pendingPlan?: PlanId | null;
  onOpenSubscription?: (plan: PlanId) => void;
  initialError?: string;
}

// Reset codes go to the API origin itself so its per-IP limits see the real client.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";

export default function LoginForm({ onComplete, onStart, pendingPlan, onOpenSubscription, initialError }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  // Password reset: the address a code was requested for ("" while choosing it).
  const [resetSentTo, setResetSentTo] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resetLoading, setResetLoading] = useState(false);
  const resetCodeInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Login presentation is plan-neutral. Paid continuation remains internal to
  // the existing validated handleLogin flow, never account entitlement.
  const loginTitle = "Login to InventaAPI";
  const loginSubtitle = "Log in to access your dashboard and manage your account.";

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  useEffect(() => {
    if (resetSentTo) resetCodeInput.current?.focus();
  }, [resetSentTo]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    onStart?.();

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // 1. Sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      console.log("[LOGIN] User authenticated:", user.email);

      // 2. Get user role from Firestore
      const userDoc = await getDocFromServer(doc(db, "users", user.uid));
      if (auth.currentUser !== user) throw new Error('Session ended during login. Please try again.');
      const userData = userDoc.data();
      const role = profileRole(userData ?? null);

      if (!role) {
        await signOut(auth);
        setError('Account unavailable. Please contact support.');
        setLoading(false);
        return;
      }

      console.log("[LOGIN] User role:", role);

      // 3. Check if admin
      if (role === "admin") {
        const adminUrl = adminLoginDestination(process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN, window.location.hostname);
        if (adminUrl && new URL(adminUrl).origin !== window.location.origin) window.location.replace(adminUrl);
        else setError('Use the separate Admin application. Contact the operator for its address.');
        return;
      }

      // Normal customer login. The business segment is chosen once at signup; catalog
      // scope always comes from the stored profile on the server, never from this form.
      const effective = await readSubscription(user);
      if (auth.currentUser !== user) throw new Error('Session ended during login.');
      const plan = effective.plan;
      // Plan checks are case-insensitive and legacy-tolerant: the DB may hold
      // "free"/"Free", "pro"/"Pro", "Starter", etc.
      const normalizedPlan = String(plan ?? "").toLowerCase();

      // ── Account Type vs Subscription Plan ────────────────────────────────
      // These are SEPARATE concerns:
      //   Account Type (role): "Developer" / "admin" — set at signup, never auto-changed.
      //   Subscription Plan:   "Free" / "Pro" / etc. — changed only by PayMongo webhook.
      //
      // Upgrading to Pro ONLY changes the subscription plan. It does NOT change the
      // account type.
      const paidPlans = ["pro", "pro max", "enterprise", "professional", "unlimited"];
      const isPaidPlan = paidPlans.includes(normalizedPlan);

      console.log("[LOGIN] ✅ Customer login successful, plan:", plan, "isPaidPlan:", isPaidPlan);

      rememberCustomerLoginEntry('free');

      // The inline form completes as part of the successful route transition; retaining
      // the form state until then avoids a flash of an unvalidated session.

      // ── Explicit paid registration intent preserved through signup ──
      // IMPORTANT: only fire if pendingPlan is STRICTLY a paid plan ("pro" or
      // "pro_max"). If pendingPlan is null, undefined, or "free", skip this
      // entire block and fall through to the plain-login redirect below.
      // This prevents a stale pendingPlan="pro" (from a previously closed upgrade
      // modal) from hijacking a Free user's plain login.
      if ((pendingPlan === "pro" || pendingPlan === "pro_max")
        && (!isPaidPlan || pendingPlan === 'pro_max' && effective.canPurchaseProMax)) {
        // Continue the existing authenticated subscription chooser. This login
        // intent never grants entitlement or changes provider/payment authority.
        setSuccess("Login successful!");
        setTimeout(() => {
          if (auth.currentUser !== user) return;
          onComplete();
          onOpenSubscription?.(pendingPlan);
        }, 600);
        return;
      }

      if ((pendingPlan === "pro" || pendingPlan === "pro_max") && isPaidPlan) {
        // Already on a paid plan and clicked Pro CTA — skip checkout, go to dashboard.
        setSuccess("You already have an active subscription! Redirecting to your dashboard...");
        setTimeout(() => {
          if (auth.currentUser !== user) return;
          onComplete();
          router.push("/dashboard");
        }, 800);
        return;
      }

      // Plain login path (no paid upgrade intent, or Free plan CTA).
      // Always redirect straight to the dashboard. The dashboard's own route
      // guards handle any further onboarding or access-denied state.
      // Never open the SubscriptionModal here — that modal is
      // only for explicit Pro upgrade flows triggered by a Pro CTA.
      setSuccess("Login successful!");
      setTimeout(() => {
        if (auth.currentUser !== user) return;
        onComplete();
        router.push("/dashboard");
      }, 600);
    } catch (err: unknown) {
      console.error("[LOGIN] Error:", err);

      let errorMessage = "An error occurred during login. Please try again.";

      if (err && typeof err === 'object' && 'code' in err) {
        const firebaseError = err as { code: string; message: string };

        switch (firebaseError.code) {
          case 'auth/wrong-password':
            errorMessage = "❌ Incorrect password. Please check your password and try again.";
            break;
          case 'auth/user-not-found':
            errorMessage = "❌ No account found with this email address. Please sign up first.";
            break;
          case 'auth/invalid-email':
            errorMessage = "❌ Invalid email format. Please enter a valid email address.";
            break;
          case 'auth/user-disabled':
            errorMessage = "❌ This account has been disabled. Please contact support.";
            break;
          case 'auth/too-many-requests':
            errorMessage = "❌ Too many failed login attempts. Please try again later.";
            break;
          case 'auth/network-request-failed':
            errorMessage = "❌ Network error. Please check your internet connection.";
            break;
          case 'auth/invalid-credential':
            errorMessage = "❌ Invalid email or password. Please check your credentials.";
            break;
          default:
            errorMessage = `❌ Login failed: ${firebaseError.code}`;
        }
      }

      setError(errorMessage);
      setLoading(false);

      setTimeout(() => {
        setError("");
      }, 5000);
    }
  };

  const sendResetCode = async (target: string) => {
    setResetLoading(true);
    try {
      const result = await sendPasswordResetCode({ base: API_BASE, email: target });
      if (!result.ok) {
        setError(result.message);
        if (result.retryAfterSeconds && target === resetSentTo) setResendSeconds(result.retryAfterSeconds);
        return false;
      }
      setResetSentTo(target); setResetCode("");
      setResendSeconds(result.resendAvailableInSeconds);
      return true;
    } finally {
      setResetLoading(false);
    }
  };

  // Step 1: email a reset code to the address typed into the Login form.
  const handleSendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const target = normalizeSignupEmail(email);
    if (!validSignupEmail(target)) {
      setError("Please enter a valid email address.");
      return;
    }
    await sendResetCode(target);
  };

  const handleResendResetCode = async () => {
    setError("");
    setSuccess("");
    if (await sendResetCode(resetSentTo)) setSuccess(`We sent a new code to ${resetSentTo}.`);
  };

  const leaveForgotMode = () => {
    setForgotMode(false); setResetSentTo(""); setResetCode("");
    setNewPassword(""); setConfirmNewPassword(""); setShowNewPassword(false);
    setError(""); setSuccess("");
  };

  // Step 2: the emailed code and the new password together change the password.
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword !== confirmNewPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!validNewPassword(newPassword)) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`);
      return;
    }
    setResetLoading(true);
    try {
      const result = await resetPasswordWithCode({ base: API_BASE, email: resetSentTo, code: resetCode, password: newPassword });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const address = resetSentTo;
      leaveForgotMode();
      setEmail(address); setPassword("");
      setSuccess("Your password has been reset. Log in with your new password.");
    } finally {
      setResetLoading(false);
    }
  };

  const enterForgotMode = () => {
    setForgotMode(true);
    setError("");
    setSuccess("");
  };

  const inputClass = "w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600";
  const primaryButtonClass = "w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center";

  return (
    <section aria-labelledby="login-form-title" className="w-full glass-card rounded-2xl p-5 sm:p-6 shadow-2xl border border-white/10 bg-slate-900/60">
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
          <h2 id="login-form-title" className="text-2xl font-bold text-white tracking-tight">{forgotMode ? "Reset your password" : loginTitle}</h2>
          <p className="text-slate-400 text-sm mt-1">{forgotMode ? "We'll email you a 6-digit code to choose a new password." : loginSubtitle}</p>
        </div>

        {(error || initialError) && (
          <div role="alert" className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400 text-sm animate-in fade-in duration-200">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="flex-1">{error || initialError}</p>
          </div>
        )}

        {success && (
          <div role="status" className="mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3 text-emerald-400 text-sm animate-in fade-in duration-200">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="flex-1">{success}</p>
          </div>
        )}

        {!forgotMode && (
        <form onSubmit={handleLogin} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-slate-300 ml-1">Email Address</label>
            <div className="relative">
              <Mail className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputClass}
                placeholder="name@company.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center ml-1">
              <label htmlFor="password" className="text-sm font-medium text-slate-300">Password</label>
              <button type="button" onClick={enterForgotMode} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <KeyRound className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-11 pr-11 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`${primaryButtonClass} mt-2`}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Login"}
          </button>
        </form>
        )}

        {/* Forgot Password Panel: email a code, then set a new password with it. */}
        {forgotMode && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {!resetSentTo ? (
              <form onSubmit={handleSendResetCode} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="reset-email" className="text-sm font-medium text-slate-300 ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="reset-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className={inputClass}
                      placeholder="name@company.com"
                    />
                  </div>
                </div>
                <button type="submit" disabled={resetLoading} className={primaryButtonClass}>
                  {resetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send Reset Code"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3">
                <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-3 text-slate-300 text-sm">
                  <MailCheck className="w-5 h-5 flex-shrink-0 mt-0.5 text-indigo-400" />
                  <p>
                    If <span className="font-medium text-white break-all">{resetSentTo}</span> has an InventaAPI account, we sent it a 6-digit code.{" "}
                    {/* One literal: the production build drops the space after a constant-folded expression. */}
                    {`It expires in ${VERIFICATION_CODE_TTL_SECONDS / 60} minutes. If you don't see it, check your Spam or Promotions folder.`}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="reset-code" className="text-sm font-medium text-slate-300 ml-1">Reset Code</label>
                  <div className="relative">
                    <ShieldCheck className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      ref={resetCodeInput}
                      id="reset-code"
                      type="text"
                      name="resetCode"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      className={`${inputClass} tracking-[0.4em]`}
                      placeholder="000000"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="new-password" className="text-sm font-medium text-slate-300 ml-1">New Password</label>
                  <div className="relative">
                    <KeyRound className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      name="newPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-11 pr-11 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none"
                    >
                      {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirm-new-password" className="text-sm font-medium text-slate-300 ml-1">Confirm New Password</label>
                  <div className="relative">
                    <KeyRound className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="confirm-new-password"
                      type={showNewPassword ? "text" : "password"}
                      name="confirmNewPassword"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      className={inputClass}
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={resetLoading || resetCode.length !== 6 || !newPassword || !confirmNewPassword}
                  className={primaryButtonClass}
                >
                  {resetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Reset Password"}
                </button>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => { setResetSentTo(""); setResetCode(""); setError(""); setSuccess(""); }}
                    disabled={resetLoading}
                    className="text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    Use a different email
                  </button>
                  <button
                    type="button"
                    onClick={handleResendResetCode}
                    disabled={resetLoading || resendSeconds > 0}
                    className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}
                  </button>
                </div>
              </form>
            )}

            <button
              type="button"
              onClick={leaveForgotMode}
              className="w-full text-sm text-indigo-400 hover:text-indigo-300 transition-colors py-2"
            >
              ← Back to Login
            </button>
          </div>
        )}

        {/* Create Account Link */}
        <div className="mt-4 text-center">
          <p className="text-sm text-slate-400">
            Don&apos;t have an account?{" "}
            <Link
              href={customerSignupDestination(pendingPlan ?? "")}
              className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              Register
            </Link>
          </p>
        </div>
    </section>
  );
}
