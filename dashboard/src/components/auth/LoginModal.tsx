"use client";

import { useState, useEffect } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff } from "lucide-react";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  // Reset all state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      console.log("[LOGIN MODAL] Modal opened - resetting state");
      // Clear all messages and form state when modal opens
      setError("");
      setSuccess("");
      setEmail("");
      setPassword("");
      setShowPassword(false);
      setLoading(false);
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
      const { doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase/config");
      
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.data();
      const role = userData?.role?.toLowerCase();
      
      console.log("[LOGIN] User role:", role);
      
      // 3. Check if admin
      if (role === "admin") {
        console.log("[LOGIN] 🔑 Admin detected - initiating token bridge...");
        
        // Show success message for admin before redirect
        setSuccess("Admin login successful! Redirecting to admin panel...");
        
        // 4. Get Firebase ID token (valid for 1 hour)
        const idToken = await user.getIdToken();
        
        console.log("[LOGIN] ✅ ID Token generated");
        
        // 5. Redirect to admin panel with token
        const adminUrl = `http://localhost:3001/?authToken=${idToken}`;
        
        console.log("[LOGIN] 🚀 Redirecting to admin panel...");
        
        // Wait 2 seconds so user can see the success message
        setTimeout(() => {
          window.location.href = adminUrl;
        }, 2000);
        
      } else {
        // Normal customer login - check if they have an active subscription
        const plan = userData?.plan;
        const hasSubscription = userData?.subscription_status === "active"
          || plan === "Free"         // Standard Free tier
          || plan === "Pro"
          || plan === "Unlimited"
          || plan === "Professional"
          || plan === "Enterprise"
          || plan === "Starter";

        console.log("[LOGIN] ✅ Customer login successful, plan:", plan, "hasSubscription:", hasSubscription);

        if (hasSubscription) {
          // Has a plan — just close modal and stay on landing page
          setSuccess("Login successful!");
          setTimeout(() => {
            onClose();
          }, 1500);
        } else {
          // No plan yet — stay on landing page
          setSuccess("Login successful! Please choose a subscription plan to continue.");
          setTimeout(() => {
            onClose();
          }, 1500);
        }
      }
      
    } catch (err: unknown) {
      console.error("[LOGIN] Error:", err);
      
      // Parse Firebase error codes into user-friendly messages
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
      
      // Keep error visible for 5 seconds before auto-clearing
      setTimeout(() => {
        setError("");
      }, 5000);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }
    setError("");
    setSuccess("");
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess("Password reset email sent! Check your inbox.");
    } catch (err: unknown) {
      setError("Failed to send reset email. " + (err as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Dark semi-transparent overlay - NO CLICK TO CLOSE */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" 
      />
      
      {/* Modal Content - Glassmorphism - NO CLOSE BUTTON */}
      <div className="w-full max-w-md glass-card rounded-2xl p-8 relative z-10 shadow-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md animate-in fade-in zoom-in duration-200">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4 shadow-lg shadow-indigo-500/20">
            <span className="text-white font-bold text-xl">IV</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Welcome to InventaAPI</h2>
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
              <button type="button" onClick={handleResetPassword} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
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

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center mt-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Login"}
          </button>
        </form>

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
