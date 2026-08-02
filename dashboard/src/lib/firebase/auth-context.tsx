"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./config";
import { useRouter, usePathname } from "next/navigation";

// PERSISTENT LOGGING via localStorage (survives page reloads)
function persistentLog(category: string, data: any) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    category,
    data
  };
  
  // Log to console
  console.log(`[📝 ${category}]`, data);
  
  // Store in localStorage
  if (typeof window !== 'undefined') {
    try {
      const key = 'auth-debug-log';
      const existing = localStorage.getItem(key);
      const logs = existing ? JSON.parse(existing) : [];
      logs.push(entry);
      
      // Keep last 100 entries
      if (logs.length > 100) {
        logs.shift();
      }
      
      localStorage.setItem(key, JSON.stringify(logs));
    } catch (e) {
      // Ignore localStorage errors
    }
  }
}

// Helper to export logs
if (typeof window !== 'undefined') {
  (window as any).exportAuthLogs = () => {
    const logs = localStorage.getItem('auth-debug-log');
    if (logs) {
      console.log('========== AUTH DEBUG LOGS ==========');
      const parsed = JSON.parse(logs);
      parsed.forEach((entry: any, idx: number) => {
        console.log(`${idx + 1}. [${entry.timestamp}] ${entry.category}:`, entry.data);
      });
      console.log('=====================================');
      return parsed;
    }
    return [];
  };
  
  (window as any).clearAuthLogs = () => {
    localStorage.removeItem('auth-debug-log');
    console.log('Auth logs cleared');
  };
}

interface AppUser {
  uid: string;
  email: string;
  fullName: string;
  businessName: string;
  businessSegment: string;
  role: string;
  plan: string;
  subscription_status?: string;
  subscriptionExpiresAt?: string;   // ISO string — set by PayMongo webhook
  apiRequestLimit?: number;
}

interface AuthContextType {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  appUser: null,
  loading: true,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // DIAGNOSTIC LOGGING: Track every appUser state change
  useEffect(() => {
    const logData = {
      exists: !!appUser,
      fullName: appUser?.fullName,
      plan: appUser?.plan,
      email: appUser?.email,
      uid: appUser?.uid
    };
    
    console.log("[🔍 FLICKER DEBUG] appUser changed:", logData);
    persistentLog('appUser-changed', logData);
  }, [appUser]);

  useEffect(() => {
    console.log("[🔍 FLICKER DEBUG] onAuthStateChanged listener initialized");
    persistentLog('listener-init', { timestamp: new Date().toISOString() });
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const authFireData = {
        hasUser: !!currentUser,
        userEmail: currentUser?.email
      };
      console.log("[🔍 FLICKER DEBUG] onAuthStateChanged fired:", authFireData);
      persistentLog('auth-fired', authFireData);
      
      setUser(currentUser);
      
      let currentAppUser: AppUser | null = null;
      
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          console.log("[AUTH DEBUG] Firestore userDoc exists:", userDoc.exists());
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log("[AUTH DEBUG] Raw Firestore data:", userData);
            console.log("[AUTH DEBUG] Firestore role value:", userData.role);
            console.log("[AUTH DEBUG] Firestore role type:", typeof userData.role);
            console.log("[AUTH DEBUG] Role === 'Admin':", userData.role === "Admin");
            console.log("[AUTH DEBUG] Role === 'admin':", userData.role === "admin");
            
            currentAppUser = userData as AppUser;
            setAppUser(currentAppUser);
            const setData = {
              fullName: currentAppUser.fullName,
              plan: currentAppUser.plan
            };
            console.log("[🔍 FLICKER DEBUG] setAppUser called with Firestore data:", setData);
            persistentLog('setAppUser-data', setData);
          } else {
            console.warn("User document not found in Firestore.");
            
            // Check if this is the superadmin account (by UID, not email)
            // UID is server-verified and non-spoofable
            // Must match value in .env: NEXT_PUBLIC_SUPERADMIN_UID
            const SUPERADMIN_UID = process.env.NEXT_PUBLIC_SUPERADMIN_UID;
            
            if (!SUPERADMIN_UID) {
              console.error("❌ CRITICAL: NEXT_PUBLIC_SUPERADMIN_UID is not set in environment variables!");
              console.error("   This variable is required to identify the superadmin account.");
              console.error("   Add to dashboard/.env.local:");
              console.error('   NEXT_PUBLIC_SUPERADMIN_UID="VpDeXopPT5cm7EtrgjfCrJ60Gjr2"');
              console.error("   Then restart the dev server.");
            }
            
            const isSuperAdmin = SUPERADMIN_UID ? currentUser.uid === SUPERADMIN_UID : false;
            
            if (isSuperAdmin) {
              console.error("❌ CRITICAL: Superadmin Firestore document is missing!");
              console.error("   Superadmin accounts MUST be created via Admin SDK scripts.");
              console.error("   Run: node scripts/create-superadmin.js");
              console.error("   DO NOT use auto-heal for admin accounts (security policy).");
              
              // Set error state so user sees clear message instead of stuck loading
              setAppUser(null);
              setLoading(false);
              
              // Show alert to user
              if (typeof window !== 'undefined') {
                alert(
                  "System Configuration Error\n\n" +
                  "Your admin account is not properly configured.\n" +
                  "Please contact the system administrator.\n\n" +
                  "Error: Missing Firestore admin document"
                );
              }
              
              return;
            }
            
            console.log("Auto-healing regular user document...");
            
            // Auto-heal: Create Firestore document for regular users only
            // Admins MUST be created via Admin SDK scripts (proper privilege escalation)
            const newDoc = {
              uid: currentUser.uid,
              fullName: "Developer",
              email: currentUser.email || "",
              businessName: "SME Store",
              businessSegment: "Hardware Store",
              plan: "Starter",
              role: "Developer",
              apiRequestLimit: 50,              // Required by Firestore rules
              apiRequestsUsed: 0,
              subscription_status: "inactive",
            };
            
            import("firebase/firestore").then(({ setDoc, doc }) => {
              setDoc(doc(db, "users", currentUser.uid), newDoc).then(() => {
                console.log("✅ Auto-heal successful");
                setAppUser(newDoc as AppUser);
              }).catch((error) => {
                console.error("❌ Auto-heal failed:", error);
              });
            });
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      } else {
        setAppUser(null);
        console.log("[🔍 FLICKER DEBUG] setAppUser(null) - user logged out");
        persistentLog('setAppUser-null', { reason: 'user logged out' });
      }
      
      setLoading(false);
      
      // ========== DEBUG LOGGING START ==========
      // Read pathname at execution time (always current value)
      const currentPathname = window.location.pathname;
      const currentSearchParams = new URLSearchParams(window.location.search);
      const isLandingBypass = currentSearchParams.get("view") === "landing";
      
      console.log("[AUTH DEBUG] ==========================================");
      console.log("[AUTH DEBUG] Pathname:", currentPathname);
      console.log("[AUTH DEBUG] currentUser exists:", !!currentUser);
      console.log("[AUTH DEBUG] currentUser email:", currentUser?.email);
      console.log("[AUTH DEBUG] currentAppUser exists:", !!currentAppUser);
      console.log("[AUTH DEBUG] currentAppUser data:", currentAppUser);
      console.log("[AUTH DEBUG] currentAppUser.role:", currentAppUser?.role);
      console.log("[AUTH DEBUG] ==========================================");
      // ========== DEBUG LOGGING END ==========
      
      // Protected routes logic - read current pathname, not captured one
      const isDashboardRoute = currentPathname.startsWith("/dashboard");
      const isAuthRoute = currentPathname === "/signup";
      const isLandingRoute = currentPathname === "/";
      
      console.log("[AUTH DEBUG] Route checks:", { isDashboardRoute, isAuthRoute, isLandingRoute, isLandingBypass });
      
      const hasActiveSubscription =
        currentAppUser?.subscription_status === "active" ||
        currentAppUser?.plan === "Pro" ||          // New canonical Pro plan name
        currentAppUser?.plan === "Unlimited" ||
        currentAppUser?.plan === "Professional" || // Legacy name (backward compat)
        currentAppUser?.plan === "Enterprise" ||
        currentAppUser?.plan === "Starter" ||      // Starter plan: can access dashboard with limited features
        currentAppUser?.plan === "Developer" ||    // Developer auto-heal accounts
        currentAppUser?.role === "admin" ||        // Admin users always have access
        currentAppUser?.role === "Admin";          // Admin users always have access
      
      console.log("[AUTH DEBUG] hasActiveSubscription:", hasActiveSubscription);
      
      // BYPASS: If user is explicitly viewing landing page with ?view=landing, skip all redirects
      if (isLandingBypass && isLandingRoute) {
        console.log("[AUTH DEBUG] 🟢 BYPASS: User viewing landing page with ?view=landing - allowing access");
        return; // Exit early, no redirects
      }
      
      if (!currentUser) {
        console.log("[AUTH DEBUG] No currentUser - checking routes...");
        // Not logged in - only allow landing and signup
        if (isDashboardRoute) {
          console.log("[AUTH DEBUG] 🔴 REDIRECT #1: No user, protected route -> redirecting to /");
          router.push("/"); // Redirect to landing page with login modal
        }
      } else if (currentAppUser) {
        console.log("[AUTH DEBUG] currentUser AND currentAppUser both exist");
        // Logged in AND user data loaded (IMPORTANT: wait for currentAppUser before making decisions)
        if (isAuthRoute) {
          console.log("[AUTH DEBUG] On signup route while logged in...");
          // Already logged in, trying to access signup - redirect to appropriate page
          if (hasActiveSubscription) {
            console.log("[AUTH DEBUG] 🔴 REDIRECT #2: User with subscription on signup -> redirecting to /dashboard");
            router.push("/dashboard");
          } else {
            console.log("[AUTH DEBUG] 🔴 REDIRECT #3: User without subscription on signup -> redirecting to /");
            router.push("/");
          }
        } else if (isDashboardRoute) {
          console.log("[AUTH DEBUG] Accessing dashboard route...");
          // Trying to access dashboard
          if (!hasActiveSubscription) {
            console.warn("[AUTH DEBUG] 🔴 REDIRECT #4: Access Denied - Active subscription required.");
            router.push("/");
          } else {
            console.log("[AUTH DEBUG] ✅ Dashboard access granted - staying on", currentPathname);
          }
          // If customer with subscription, stay on dashboard
        }
        // If on landing page - do nothing, let user stay there
      } else {
        console.log("[AUTH DEBUG] ⏳ currentUser exists but currentAppUser still loading - waiting...");
      }
      // If currentUser exists but currentAppUser is still loading, do nothing (wait for data)
    });

    return () => unsubscribe();
  }, []); // Empty array: mount once, never re-run (no more flicker!)

  const logout = async () => {
    try {
      console.log("[AUTH] 🚪 Logging out...");
      setLoading(true);
      
      // 1. Clear local state immediately
      setUser(null);
      setAppUser(null);
      
      // 2. Sign out from Firebase
      await firebaseSignOut(auth);
      
      console.log("[AUTH] ✅ Signed out from Firebase");
      
      // 3. Force router refresh to clear cached state
      router.push("/");
      router.refresh(); // This forces Next.js to re-render the page with fresh state
      
    } catch (error) {
      console.error("[AUTH] ❌ Error logging out:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, appUser, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
