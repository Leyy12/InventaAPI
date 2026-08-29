"use client";

import { useState } from "react";
import Image from "next/image";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      console.log("[ADMIN LOGIN] Attempting authentication...");
      
      // Step 1: Authenticate with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      console.log("[ADMIN LOGIN] User authenticated:", user.email);
      
      // Step 2: Get user role from Firestore
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        console.warn("[ADMIN LOGIN] User document not found");
        await auth.signOut();
        setError("Access denied. Invalid credentials.");
        setLoading(false);
        return;
      }
      
      const userData = userDoc.data();
      const role = userData?.role?.toLowerCase();
      
      console.log("[ADMIN LOGIN] User role:", role);
      
      // Step 3: Verify admin role (generic error if not admin)
      if (role !== "admin") {
        console.warn("[ADMIN LOGIN] Non-admin user attempted access");
        await auth.signOut();
        setError("Access denied. Invalid credentials.");
        setLoading(false);
        return;
      }
      
      // Step 4: Admin verified - redirect to dashboard
      console.log("[ADMIN LOGIN] ✅ Admin access granted");
      router.push("/");
      
    } catch (err: unknown) {
      console.error("[ADMIN LOGIN] Error:", err);
      
      // Generic error message for all authentication failures
      // (wrong password, user not found, network error, etc.)
      setError("Access denied. Invalid credentials.");
      setLoading(false);
      
      // Auto-clear error after 5 seconds
      setTimeout(() => {
        setError("");
      }, 5000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-950/20 via-transparent to-transparent" />
      
      {/* Login Card */}
      <div className="w-full max-w-md relative z-10">
        <div className="glass-card rounded-2xl p-8 shadow-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md">
          
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-4">
              <Image
                src="/inventa-logo.png"
                alt="InventaAPI Logo"
                width={160}
                height={160}
                className="object-contain drop-shadow-lg"
                priority
              />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight mt-4">Admin Panel</h1>
            <p className="text-slate-400 text-sm mt-2">Secure authentication required</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-3 text-indigo-400 text-sm animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="flex-1">{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-slate-300 ml-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  id="email"
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-red-500/50 transition-all placeholder:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="admin@company.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-slate-300 ml-1">
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  id="password"
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-11 pr-11 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-red-500/50 transition-all placeholder:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none"
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Authenticating...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500">
              Admin access only. All login attempts are monitored.
            </p>
          </div>
        </div>

        {/* Additional Security Notice */}
        <div className="mt-4 text-center">
          <p className="text-xs text-slate-600">
            Need admin access? Contact your system administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
