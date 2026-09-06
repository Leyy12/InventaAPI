"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./config";
import { useRouter, usePathname } from "next/navigation";



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
  // Free-plan segment restriction: which product segment this user may access.
  // Set during the Welcome/Quick Setup flow after first login.
  // Only enforced when plan === "Free".
  selectedSegment?: 'Grocery' | 'Pharmacy' | 'Hardware';
}

interface AuthContextType {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUserDoc: () => Promise<AppUser | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  appUser: null,
  loading: true,
  logout: async () => {},
  refreshUserDoc: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  // Read cache synchronously — safe because Sidebar uses isMounted to prevent SSR flash
  const readCache = <T,>(key: string): T | null => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : null;
    } catch {
      return null;
    }
  };

  const [user, setUser] = useState<User | null>(() => readCache<User>("userCache"));
  const [appUser, setAppUser] = useState<AppUser | null>(() => readCache<AppUser>("appUserCache"));
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Track current appUser value for logging (avoid stale closure in logs)
  const appUserRef = React.useRef<AppUser | null>(null);
  React.useEffect(() => {
    appUserRef.current = appUser;
  }, [appUser]);

  // Prevent duplicate login audit log writes on page refresh
  const loginLoggedRef = React.useRef<string | null>(null);

  // Track tab visibility changes (critical for throttling hypothesis)
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      const timestamp = new Date().toISOString();
      const timeOnly = timestamp.substring(11, 23);
      console.log(`\n[🔍 TAB VISIBILITY @ ${timeOnly}] Document became: ${document.visibilityState}`);
      console.log(`  Window focused: ${document.hasFocus()}`);
      console.log(`  Current auth.currentUser: ${auth.currentUser ? `EXISTS (${auth.currentUser.email})` : '❌ NULL'}`);
      console.log(`  Current appUser: ${appUserRef.current ? `EXISTS (${appUserRef.current.fullName})` : '❌ NULL'}`);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', () => {
      const timestamp = new Date().toISOString();
      const timeOnly = timestamp.substring(11, 23);
      console.log(`[🔍 WINDOW FOCUS @ ${timeOnly}] Window regained focus`);
    });
    window.addEventListener('blur', () => {
      const timestamp = new Date().toISOString();
      const timeOnly = timestamp.substring(11, 23);
      console.log(`[🔍 WINDOW BLUR @ ${timeOnly}] Window lost focus`);
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    console.log('[🔍 AUTH DIAGNOSTIC] Listener mounted at:', new Date().toISOString());
    console.log('[🔍 AUTH DIAGNOSTIC] React Strict Mode may cause double-mount in dev');
    console.log('[🔍 AUTH DIAGNOSTIC] Document visibility:', document.visibilityState);
    console.log('[🔍 AUTH DIAGNOSTIC] Window focused:', document.hasFocus());
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const timestamp = new Date().toISOString();
      const timeOnly = timestamp.substring(11, 23); // HH:MM:SS.mmm
      
      console.log(`\n[🔍 AUTH DIAGNOSTIC @ ${timeOnly}] onAuthStateChanged FIRED`);
      console.log(`  TRIGGER CONTEXT:`);
      console.log(`    - Document visibility: ${document.visibilityState}`);
      console.log(`    - Window focused: ${document.hasFocus()}`);
      console.log(`    - Network online: ${navigator.onLine}`);
      console.log(`  AUTH STATE:`);
      console.log(`    - currentUser (callback param): ${currentUser ? `EXISTS (${currentUser.email})` : '❌ NULL'}`);
      console.log(`    - existing appUser (ref): ${appUserRef.current ? `EXISTS (${appUserRef.current.fullName}, ${appUserRef.current.plan})` : '❌ NULL'}`);
      console.log(`    - auth.currentUser (direct): ${auth.currentUser ? `EXISTS (${auth.currentUser.email})` : '❌ NULL'}`);
      
      setUser(currentUser);
      if (currentUser && typeof window !== 'undefined') {
        localStorage.setItem("userCache", JSON.stringify({ uid: currentUser.uid, email: currentUser.email }));
      }
      
      let currentAppUser: AppUser | null = null;
      
      if (currentUser) {
        console.log(`  [🔍 ${timeOnly}] Branch: currentUser EXISTS - fetching Firestore doc...`);
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          console.log(`  [🔍 ${timeOnly}] Firestore read completed, doc exists: ${userDoc.exists()}`);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            
            currentAppUser = userData as AppUser;
            console.log(`  [🔍 ${timeOnly}] ✅ Setting appUser from Firestore: ${currentAppUser.fullName} (${currentAppUser.plan})`);
            setAppUser(currentAppUser);
            if (typeof window !== 'undefined') {
              localStorage.setItem("appUserCache", JSON.stringify(currentAppUser));
            }

            // Write Customer Login audit log ONCE per session (not on every page refresh)
            if (loginLoggedRef.current !== currentUser.uid) {
              loginLoggedRef.current = currentUser.uid;
              try {
                await addDoc(collection(db, "audit_logs"), {
                  action: "Customer Login",
                  userId: currentUser.uid,
                  userEmail: currentUser.email || 'unknown@email.com',
                  timestamp: serverTimestamp(),
                  details: 'User logged in successfully',
                  userAgent: navigator.userAgent || null,
                  ipAddress: null
                });
                console.log(`  [🔍 ${timeOnly}] ✅ Customer Login audit log written`);
              } catch (auditErr) {
                console.warn("[Audit] Failed to write login log:", auditErr);
              }
            } else {
              console.log(`  [🔍 ${timeOnly}] ⏭️  Login already logged this session, skipping duplicate`);
            }
          } else {
            console.log(`  [🔍 ${timeOnly}] ⚠️  Firestore doc does NOT exist - checking superadmin/auto-heal...`);
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
            
            console.log("Waiting to avoid race condition with signup form...");
            
            setTimeout(() => {
              import("firebase/firestore").then(async ({ getDoc, setDoc, doc }) => {
                try {
                  const retryDoc = await getDoc(doc(db, "users", currentUser.uid));
                  if (retryDoc.exists()) {
                    console.log("✅ Document created by signup form, skipping auto-heal.");
                    setAppUser(retryDoc.data() as AppUser);
                    return;
                  }
                  
                  console.log("Auto-healing regular user document...");
                  const newDoc = {
                    uid: currentUser.uid,
                    fullName: currentUser.displayName || "Developer",
                    email: currentUser.email || "",
                    businessName: "SME Store",
                    businessSegment: "Hardware Store",
                    plan: "Free",
                    role: "Developer",
                    apiRequestLimit: 50,
                    apiRequestsUsed: 0,
                    subscription_status: "inactive",
                  };
                  
                  await setDoc(doc(db, "users", currentUser.uid), newDoc);
                  console.log("✅ Auto-heal successful");
                  setAppUser(newDoc as AppUser);
                } catch (error) {
                  console.error("❌ Auto-heal failed:", error);
                }
              });
            }, 2000);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          console.log(`  [🔍 ${timeOnly}] ❌ Firestore read ERROR:`, error);
        }
      } else {
        console.log(`  [🔍 ${timeOnly}] Branch: currentUser is NULL`);
        console.log(`  [🔍 ${timeOnly}] Had existing appUser before this?: ${appUserRef.current ? `YES (${appUserRef.current.fullName})` : 'NO'}`);
        console.log(`  [🔍 ${timeOnly}] ❌ Calling setAppUser(null) now...`);
        setAppUser(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem("userCache");
          localStorage.removeItem("appUserCache");
        }
        // Reset login tracking so next login writes a fresh audit log
        loginLoggedRef.current = null;
        console.log(`  [🔍 ${timeOnly}] setAppUser(null) completed\n`);
      }
      
      setLoading(false);
      
      // Protected routes logic
      const currentPathname = window.location.pathname;
      const currentSearchParams = new URLSearchParams(window.location.search);
      const isLandingBypass = currentSearchParams.get("view") === "landing";
      const isDashboardRoute = currentPathname.startsWith("/dashboard");
      const isAuthRoute = currentPathname === "/signup";
      const isLandingRoute = currentPathname === "/";
      
      // Case-insensitive + legacy-tolerant: the DB may hold "Free"/"free",
      // "Starter", etc. (scripts like update-leah-plan write lowercase values),
      // so exact `=== "Free"` checks wrongly classified those as "no plan" and
      // bounced subscribers away from the dashboard.
      const normalizedPlan = String(currentAppUser?.plan ?? "").toLowerCase();
      const hasActiveSubscription =
        currentAppUser?.subscription_status === "active" ||
        normalizedPlan === "free" ||         // Standard Free tier
        normalizedPlan === "deleted" ||      // Churned/reset Free accounts — still Free-tier access
        normalizedPlan === "starter" ||      // Legacy Starter plan
        normalizedPlan === "pro" ||          // Pro plan
        normalizedPlan === "unlimited" ||
        normalizedPlan === "professional" || // Legacy name (backward compat)
        normalizedPlan === "enterprise" ||
        currentAppUser?.role === "admin" ||        // Admin users always have access
        currentAppUser?.role === "Admin";          // Admin users always have access
      
      // BYPASS: If user is explicitly viewing landing page with ?view=landing, skip all redirects
      if (isLandingBypass && isLandingRoute) {
        return; // Exit early, no redirects
      }
      
      if (!currentUser) {
        // Not logged in - only allow landing and signup
        if (isDashboardRoute) {
          router.push("/"); // Redirect to landing page with login modal
        }
      } else if (currentAppUser) {
        // Logged in AND user data loaded (IMPORTANT: wait for currentAppUser before making decisions)


        if (isAuthRoute) {
          // Already logged in, trying to access signup - redirect to appropriate page
          // IMPORTANT: Do NOT redirect here. The signup page handles its own auth flow
          // (including the automatic sign-out after creation). Redirecting here causes
          // a race condition where the user is thrown to the landing page prematurely.
        } else if (isDashboardRoute) {
          // Trying to access dashboard
          if (!hasActiveSubscription) {
            router.push("/");
          }
          // If customer with subscription, stay on dashboard
        }
        // If on landing page - do nothing, let user stay there
      }
      // If currentUser exists but currentAppUser is still loading, do nothing (wait for data)
    });

    return () => {
      console.log('[🔍 AUTH DIAGNOSTIC] Cleanup: unsubscribing listener at:', new Date().toISOString());
      unsubscribe();
    };
  }, []); // Empty array: mount once, never re-run (no more flicker!)

  const logout = async () => {
    try {
      // 1. Capture identity BEFORE clearing state (auth token still valid here)
      const uid   = user?.uid ?? null;
      const email = user?.email ?? appUser?.email ?? null;

      // 2. Clear local cache immediately so nothing stale is read after signout
      if (typeof window !== 'undefined') {
        localStorage.removeItem("userCache");
        localStorage.removeItem("appUserCache");
      }

      // 3. Clear React state immediately
      setUser(null);
      setAppUser(null);

      // 4. Fire-and-forget audit log — do NOT await (never block sign-out on this)
      if (uid) {
        void addDoc(collection(db, "audit_logs"), {
            action: "Customer Logout",
            userId: uid,
            userEmail: email || 'unknown@email.com',
            timestamp: serverTimestamp(),
            details: 'User logged out successfully',
            userAgent: navigator.userAgent || null,
            ipAddress: null
        }).catch((auditErr) => {
          console.warn("[Audit] Failed to write logout log:", auditErr);
        });
      }

      // 5. Sign out from Firebase — this triggers onAuthStateChanged(null) which
      //    sets loading=false on its own. Do NOT call setLoading(true/false) here
      //    as that races with the listener and causes the double-click bug.
      await firebaseSignOut(auth);

      // 6. Hard redirect to landing page — use window.location.href instead of
      //    router.push() to guarantee a full-page reload that clears all Next.js
      //    route cache and React state. router.push can be silently intercepted by
      //    the auth guard, causing the redirect to fail on the first attempt.
      window.location.href = "/";

    } catch (error) {
      console.error("Error logging out:", error);
      // On error, still try to get to landing page
      window.location.href = "/";
    }
  };

  const refreshUserDoc = async (): Promise<AppUser | null> => {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    try {
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (userDoc.exists()) {
        const fresh = userDoc.data() as AppUser;
        setAppUser(fresh);
        if (typeof window !== "undefined") {
          localStorage.setItem("appUserCache", JSON.stringify(fresh));
        }
        return fresh;
      }
      return null;
    } catch (error) {
      console.error("[AuthContext] refreshUserDoc failed:", error);
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{ user, appUser, loading, logout, refreshUserDoc }}>
      {children}
    </AuthContext.Provider>
  );
};
