"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
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

  // Track current appUser value for logging (avoid stale closure in logs)
  const appUserRef = React.useRef<AppUser | null>(null);
  React.useEffect(() => {
    appUserRef.current = appUser;
  }, [appUser]);

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
          console.log(`  [🔍 ${timeOnly}] ❌ Firestore read ERROR:`, error);
        }
      } else {
        console.log(`  [🔍 ${timeOnly}] Branch: currentUser is NULL`);
        console.log(`  [🔍 ${timeOnly}] Had existing appUser before this?: ${appUserRef.current ? `YES (${appUserRef.current.fullName})` : 'NO'}`);
        console.log(`  [🔍 ${timeOnly}] ❌ Calling setAppUser(null) now...`);
        setAppUser(null);
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
          if (hasActiveSubscription) {
            router.push("/dashboard");
          } else {
            router.push("/");
          }
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
      setLoading(true);
      
      // 1. Clear local state immediately
      setUser(null);
      setAppUser(null);
      
      // 2. Sign out from Firebase
      await firebaseSignOut(auth);
      
      // 3. Force router refresh to clear cached state
      router.push("/");
      router.refresh(); // This forces Next.js to re-render the page with fresh state
      
    } catch (error) {
      console.error("Error logging out:", error);
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
