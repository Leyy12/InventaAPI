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
}

const SEGMENT_OPTIONS = [
  { id: "Grocery", label: "Grocery" },
  { id: "Pharmacy", label: "Pharmacy" },
  { id: "Hardware", label: "Hardware" },
] as const;

type SegmentId = "Grocery" | "Pharmacy" | "Hardware";

export default function LoginModal({ isOpen, onClose, pendingPlan, onOpenSubscription }: LoginModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [segment, setSegment] = useState<SegmentId | "">("");
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
      console.log("[LOGIN MODAL] Modal opened - resetting state");
      setError("");
      setSuccess("");
      setEmail("");
      setPassword("");
      setSegment("");
      setShowPassword(false);
      setLoading(false);
      setSegmentBlocked(false);
      setForgotMode(false);
      setResetSent(false);
      setResetLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const hasSubscription =
        userData?.subscription_status === "active" ||
        plan === "Free" ||
        plan === "Pro" ||
        plan === "Unlimited" ||
        plan === "Professional" ||
        plan === "Enterprise" ||
        plan === "Starter";

      console.log("[LOGIN] ✅ Customer login successful, plan:", plan, "existingSegment:", existingSegment);

      // The BUSINESS SEGMENT dropdown is REQUIRED on EVERY login, for ALL plans,
      // even if the account already has a segment. The user must explicitly
      // (re)select it here before they may enter the dashboard.
      const chosenSegment = segment as SegmentId;

      if (!chosenSegment) {
        // REJECT: Without a segment the login does NOT succeed. Stay on the modal,
        // disable the submit button and require the user to pick a segment first.
        setSegmentBlocked(true);
        setError("Please select your business segment to continue. Login is blocked until a segment is chosen.");
        setLoading(false);
        return;
      }

      // Persist the segment if it was missing or changed
      if (chosenSegment !== existingSegment || !existingSegment) {
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

      // Upgrade intent (user clicked a Pro/Enterprise CTA before logging in)
      if (pendingPlan === "pro" || pendingPlan === "enterprise") {
        setSuccess("Login successful!");
        setTimeout(() => {
          onClose();
          onOpenSubscription?.(pendingPlan);
        }, 600);
        return;
      }

      if (hasSubscription) {
        // Has a plan & segment — go straight into the dashboard
        setSuccess("Login successful!");
        setTimeout(() => {
          router.push("/dashboard/products");
        }, 600);
      } else {
        setSuccess("Login successful! Please choose a subscription plan to continue.");
        setTimeout(() => {
          onClose();
        }, 600);
      }
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
          <h2 className="text-2xl font-bold text-white tracking-tight mt-2">Welcome to InventaAPI</h2>
          <p className="text-slate-400 text-sm mt-2">Log in to manage your DaaS platform</p>
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

          {/* Business Segment dropdown — REQUIRED on every login, for all plans.
              Logic in handleLogin rejects the login if nothing is selected. */}
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
                className="w-full appearance-none bg-slate-900/50 border border-slate-700 rounded-xl pl-11 pr-10 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600 cursor-pointer"
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
            <p className="text-[11px] text-slate-500 ml-1">
              Choose the business segment your account accesses. This is required to log in, and your catalog is
              tailored to it. Free plan includes 50 requests/day and 1 API key; upgrade to{" "}
              <span className="text-indigo-400">Pro</span> to unlock all segments.
            </p>
          </div>

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
            <a href="/signup" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              Create Account
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

