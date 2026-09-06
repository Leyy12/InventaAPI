"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";
import { KeyRound, Mail, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff, Sparkles, Building2, X } from "lucide-react";
import type { PlanId } from "@/config/plans";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingPlan?: PlanId | null;
  onOpenSubscription?: (plan: PlanId) => void;
  initialError?: string;
}

const SEGMENT_OPTIONS = [
  { id: "Grocery", label: "Grocery" },
  { id: "Pharmacy", label: "Pharmacy" },
  { id: "Hardware", label: "Hardware" },
] as const;

type SegmentId = "Grocery" | "Pharmacy" | "Hardware";

export default function LoginModal({ isOpen, onClose, pendingPlan, onOpenSubscription, initialError }: LoginModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [segment, setSegment] = useState<SegmentId | "">("");
  const [showSegment, setShowSegment] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [segmentBlocked, setSegmentBlocked] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const router = useRouter();
  const { refreshUserDoc } = useAuth();

  // Reset all state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      console.log("[LOGIN MODAL] Modal opened - resetting state, pendingPlan:", pendingPlan);
      setError(initialError || "");
      setSuccess("");
      setEmail("");
      setPassword("");
      setSegment("");
      // Segment dropdown is ONLY shown upfront when the user explicitly clicked
      // the Free plan CTA (pendingPlan === 'free'). For plain logins and Pro/
      // Enterprise upgrade intents, we do NOT show it upfront because:
      //   - Pro/Enterprise: user has access to all segments, no selection needed.
      //   - Plain login (null pendingPlan): user might already be Pro — we don't
      //     know their plan until after Firebase auth, so we cannot require a
      //     segment selection before we know if they need one.
      const isFreeFlowOnOpen = pendingPlan === "free";
      setShowSegment(isFreeFlowOnOpen);
      setSegmentBlocked(false);
      setShowPassword(false);
      setLoading(false);
      setForgotMode(false);
      setResetSent(false);
      setResetLoading(false);
    }
  // Re-run whenever isOpen, pendingPlan, OR initialError changes so segment visibility and initial errors are always
  // correct even when they are set after the modal first mounts.
  }, [isOpen, pendingPlan, initialError]);

  if (!isOpen) return null;

  // Plan-aware messaging:
  // - Pro/Enterprise: checkout handoff (PayMongo flow).
  // - Free: dedicated Free-plan login.
  // - No pendingPlan (plain login, no plan context): generic fallback.
  const isUpgradeIntent = pendingPlan === "pro" || pendingPlan === "enterprise";
  const isFreeFlow = pendingPlan === "free";

  const modalTitle = isUpgradeIntent
    ? pendingPlan === "pro"
      ? "Login to continue to your Pro upgrade"
      : "Login to continue to Enterprise"
    : isFreeFlow
      ? "Login to continue to InventaAPI Free"
      : "Welcome to InventaAPI";

  const modalSubtitle = isUpgradeIntent
    ? "Log in to continue to the secure PayMongo checkout."
    : isFreeFlow
      ? "Log in to access your Free plan dashboard."
      : "Log in to manage your DaaS platform";

  const segmentHint = isUpgradeIntent ? (
    <>
      Choose the business segment your account will access. This is required to log in and your catalog is
      tailored to it. After logging in, you will continue to PayMongo checkout to{" "}
      {pendingPlan === "pro" ? (
        <>
          unlock <span className="text-indigo-400">Pro</span> (5,000 requests/day, all segments).
        </>
      ) : (
        <>set up <span className="text-indigo-400">Enterprise</span>.</>
      )}
    </>
  ) : (
    <>
      Choose the business segment your account accesses. This is required to log in, and your catalog is
      tailored to it. Free plan includes 50 requests/day and 1 API key; upgrade to{" "}
      <span className="text-indigo-400">Pro</span> to unlock all segments.
    </>
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // No pre-auth segment block here — we don't know the user's plan until
    // after Firebase auth. The post-auth check (below) handles segment gating
    // correctly once we know whether this is a Free or Pro account.

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // 1. Sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      console.log("[LOGIN] User authenticated:", user.email);

      // 2. Get user role from Firestore
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.data();
      const role = userData?.role?.toLowerCase();

      console.log("[LOGIN] User role:", role);

      // 3. Check if admin
      if (role === "admin") {
        console.log("[LOGIN] 🔑 Admin detected - initiating token bridge...");

        setSuccess("Admin login successful! Redirecting to admin panel...");

        const idToken = await user.getIdToken();
        const adminUrl = `http://localhost:3001/?authToken=${idToken}`;

        setTimeout(() => {
          window.location.href = adminUrl;
        }, 2000);
        return;
      }

      // Normal customer login
      const plan = userData?.plan;
      const existingSegment = (userData?.selectedSegment as SegmentId | undefined) ?? "";
      // Plan checks are case-insensitive and legacy-tolerant: the DB may hold
      // "free"/"Free", "pro"/"Pro", "Starter", etc. (scripts like update-leah-plan
      // write lowercase values), so the exact `=== "Free"` checks wrongly classified
      // those accounts as "no plan" and opened the Pro plan chooser after login.
      const normalizedPlan = String(plan ?? "").toLowerCase();
      const hasSubscription =
        userData?.subscription_status === "active" ||
        normalizedPlan === "free" ||
        normalizedPlan === "deleted" ||   // churned/reset Free accounts
        normalizedPlan === "starter" ||
        normalizedPlan === "pro" ||
        normalizedPlan === "unlimited" ||
        normalizedPlan === "professional" ||
        normalizedPlan === "enterprise";

      console.log("[LOGIN] ✅ Customer login successful, plan:", plan, "existingSegment:", existingSegment);

      // Segment handling is plan-aware (post-auth, now that we know the account's plan):
      // - Pro/Enterprise (and legacy paid tiers) are NOT gated — they have access to
      //   all segments; the upfront dropdown is hidden again once they're authenticated.
      // - Free/Starter (or unknown-plan) accounts WITHOUT a saved segment must choose
      //   one before entering — the dropdown is already visible upfront; login stays
      //   blocked until a segment is selected and saved.
      const paidPlans = ["pro", "enterprise", "professional", "unlimited"];
      const isPaidPlan = paidPlans.includes(normalizedPlan);
      const isUpgradeIntent = pendingPlan === "pro" || pendingPlan === "enterprise";
      const chosenSegment = segment as SegmentId;
      
      // A segment pick is needed IF:
      // 1. They are currently on a Free plan AND
      // 2. They don't already have a segment saved AND
      // 3. They are NOT currently in the middle of a Pro/Enterprise upgrade flow.
      // (If they are upgrading, they are about to buy full access, so don't block them).
      const needsSegmentPick = !isPaidPlan && !existingSegment && !isUpgradeIntent;

      if (needsSegmentPick && !chosenSegment) {
        // REJECT: A Free/Starter account with no saved segment cannot enter until it
        // picks one. The dropdown is ALREADY visible upfront (all non-upgrade logins
        // show it), so no reveal is needed here — just block and keep it on screen.
        setSegmentBlocked(true);
        setError("Please select your business segment to continue. Login is blocked until a segment is chosen.");
        setLoading(false);
        return;
      }

      // Persist the segment only for accounts that actually need it (Free without one).
      // Paid accounts are never written to here — an existing segment (if any) stays untouched.
      if (needsSegmentPick && chosenSegment) {
        try {
          await updateDoc(doc(db, "users", user.uid), { selectedSegment: chosenSegment });
          await refreshUserDoc();
          console.log("[LOGIN] Saved selectedSegment:", chosenSegment);
        } catch (writeErr) {
          console.error("[LOGIN] Failed to save segment:", writeErr);
          setError("Failed to save your business segment. Please try again.");
          setLoading(false);
          return;
        }
      }

      // Requirement satisfied or not needed (paid plan, or Free with a saved segment):
      // hide the dropdown so paid accounts complete a clean, dropdown-free login.
      setShowSegment(false);

      // ── Upgrade intent (user clicked a Pro/Enterprise CTA before logging in) ──
      // IMPORTANT: only fire if pendingPlan is STRICTLY a paid plan ("pro" or
      // "enterprise"). If pendingPlan is null, undefined, or "free", skip this
      // entire block and fall through to the plain-login redirect below.
      // This prevents a stale pendingPlan="pro" (from a previously closed upgrade
      // modal) from hijacking a Free user's plain login.
      if ((pendingPlan === "pro" || pendingPlan === "enterprise") && !isPaidPlan) {
        // Free/Starter user who explicitly came through a Pro/Enterprise CTA —
        // continue the upgrade journey: open the plan chooser → GCash checkout.
        setSuccess("Login successful!");
        setTimeout(() => {
          onClose();
          onOpenSubscription?.(pendingPlan);
        }, 600);
        return;
      }

      if ((pendingPlan === "pro" || pendingPlan === "enterprise") && isPaidPlan) {
        // Already on a paid plan and clicked Pro CTA — skip checkout, go to dashboard.
        setSuccess("You already have an active subscription! Redirecting to your dashboard...");
        setTimeout(() => {
          onClose();
          router.push("/dashboard");
        }, 800);
        return;
      }

      // Plain login path (no paid upgrade intent, or Free plan CTA).
      // Always redirect straight to the dashboard. The dashboard's own route
      // guards will handle any further onboarding (e.g. /dashboard/welcome for
      // Free users who haven't selected a segment yet, or access-denied for truly
      // unpaid accounts). Never open the SubscriptionModal here — that modal is
      // only for explicit Pro upgrade flows triggered by a Pro CTA.
      setSuccess("Login successful!");
      setTimeout(() => {
        onClose();
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

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Please enter your email address first so we know where to send the reset link.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address to receive the reset link.");
      return;
    }
    setError("");
    setSuccess("");
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
      setResetLoading(false);
      setSuccess("Reset link sent! Check your inbox. Click the link to set a new password, then log in.");
    } catch (err: unknown) {
      setResetLoading(false);
      setError("Failed to send reset email. " + (err as Error).message);
    }
  };

  const enterForgotMode = () => {
    setForgotMode(true);
    setError("");
    setSuccess("");
    setResetSent(false);
    // Pre-fill the email if already typed
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Dark semi-transparent overlay - click anywhere outside to close */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content - Glassmorphism */}
      <div className="w-full max-w-md glass-card rounded-2xl p-8 relative z-10 shadow-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md animate-in fade-in zoom-in duration-200">

        {/* Close button - lets the consumer back out of the login modal */}
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close login"
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <Image
              src="/inventa-logo.png"
              alt="InventaAPI Logo"
              width={120}
              height={120}
              className="object-contain"
              priority
            />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight mt-2">{modalTitle}</h2>
          <p className="text-slate-400 text-sm mt-2">{modalSubtitle}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400 text-sm animate-in fade-in duration-200">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="flex-1">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3 text-emerald-400 text-sm animate-in fade-in duration-200">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="flex-1">{success}</p>
          </div>
        )}

        {!forgotMode && (
        <form onSubmit={handleLogin} className="space-y-5">
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
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
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
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-11 pr-11 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
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

          {/* Business Segment dropdown — visible upfront for all non-upgrade logins
              (plain login and the Free flow), alongside the credentials. After
              authentication it is hidden for accounts that don't need it (paid plans,
              or Free accounts that already have a saved segment); for Free/Starter
              without a segment it stays on screen and login remains blocked until one
              is chosen and saved. Upgrade-intent logins (Pro/Enterprise checkout
              handoff) never show it. */}
          {showSegment && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between ml-1">
              <label htmlFor="segment" className="text-sm font-medium text-slate-300">Business Segment</label>
              <span className="text-[11px] text-indigo-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Required
              </span>
            </div>
            <div className="relative">
              <Building2 className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                id="segment"
                value={segment}
                onChange={(e) => {
                  setSegment(e.target.value as SegmentId | "");
                  if (segmentBlocked && e.target.value) {
                    setSegmentBlocked(false);
                    setError("");
                  }
                }}
                className={`w-full appearance-none bg-slate-900/50 border rounded-xl pl-11 pr-10 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 transition-all placeholder:text-slate-600 cursor-pointer ${
                  segmentBlocked
                    ? "border-red-500/70 focus:border-red-500/70 focus:ring-red-500/30"
                    : "border-slate-700 focus:border-indigo-500/50 focus:ring-indigo-500/50"
                }`}
              >
                <option value="">Select your business segment</option>
                {SEGMENT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <p className="text-[11px] text-slate-500 ml-1">{segmentHint}</p>
          </div>
          )}

          <button
            type="submit"
            disabled={loading || segmentBlocked}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center mt-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Login"}
          </button>

          {segmentBlocked && (
            <p className="text-center text-xs text-slate-400 mt-2 animate-in fade-in duration-200">
              Select your business segment above to enable the Login button.
            </p>
          )}
        </form>
        )}

        {/* Forgot Password Panel */}
        {forgotMode && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {!resetSent ? (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="reset-email" className="text-sm font-medium text-slate-300 ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="reset-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
                      placeholder="name@company.com"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400 ml-1">
                  We'll email you a secure link to reset your password.
                </p>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetLoading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center"
                >
                  {resetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send Reset Link"}
                </button>
              </>
            ) : (
              <div className="text-center py-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <p className="text-sm text-slate-200 font-medium">Reset link sent!</p>
                <p className="text-xs text-slate-400 mt-1">
                  Check your inbox for an email from InventaAPI. Click the link to set a new password, then come back
                  and log in.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => { setForgotMode(false); setResetSent(false); setError(""); setSuccess(""); }}
              className="w-full text-sm text-indigo-400 hover:text-indigo-300 transition-colors py-2"
            >
              ← Back to Login
            </button>
          </div>
        )}

        {/* Create Account Link */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-400">
            Don't have an account?{" "}
            <a
              href={`/signup${pendingPlan && pendingPlan !== "free" ? `?pendingPlan=${pendingPlan}` : ""}`}
              className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              Create Account
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

