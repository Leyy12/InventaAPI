"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./config";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface AppUser {
  uid: string;
  email: string;
  fullName: string;
  businessName: string;
  businessSegment: string;
  role: string;
  plan: string;
  subscription_status?: string;
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
  const searchParams = useSearchParams();
  const isLandingBypass = searchParams.get("view") === "landing";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      let currentAppUser: AppUser | null = null;
      
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            currentAppUser = userDoc.data() as AppUser;
            setAppUser(currentAppUser);
          } else {
            console.warn("User document not found in Firestore. Auto-healing...");
            // Auto-heal logic
            const isSuperAdmin = currentUser.email === 'balquinkevinconeal27@gmail.com';
            const newDoc = {
              uid: currentUser.uid,
              fullName: isSuperAdmin ? "Kevin (Super Admin)" : "Developer",
              email: currentUser.email || "",
              businessName: isSuperAdmin ? "InventaAPI Research" : "SME Store",
              businessSegment: isSuperAdmin ? "Admin" : "Hardware Store",
              plan: isSuperAdmin ? "Unlimited" : "Starter",
              role: isSuperAdmin ? "Admin" : "Developer",
              subscription_status: isSuperAdmin ? "active" : "inactive",
            };
            import("firebase/firestore").then(({ setDoc, doc }) => {
              setDoc(doc(db, "users", currentUser.uid), newDoc).then(() => {
                setAppUser(newDoc as AppUser);
              });
            });
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      } else {
        setAppUser(null);
      }
      
      setLoading(false);
      
      // Protected routes logic
      const isDashboardRoute = pathname.startsWith("/dashboard");
      const isAdminRoute = pathname.startsWith("/admin");
      const isAuthRoute = pathname === "/signup";
      const isLandingRoute = pathname === "/";
      
      const hasActiveSubscription = 
        currentAppUser?.subscription_status === "active" || 
        currentAppUser?.plan === "Unlimited" || 
        currentAppUser?.plan === "Professional" || 
        currentAppUser?.plan === "Enterprise";
      
      if (!currentUser) {
        if (isDashboardRoute || isAdminRoute) {
          router.push("/"); // Redirect to landing page with login modal
        }
      } else {
        if (isAuthRoute) {
          if (currentAppUser?.role === "Admin") {
            router.push("/admin");
          } else if (hasActiveSubscription) {
            router.push("/dashboard");
          } else {
            router.push("/");
          }
        } else if (isAdminRoute && currentAppUser?.role !== "Admin") {
          // Block non-admins from admin panel
          console.warn("Access Denied: Admin role required.");
          router.push(hasActiveSubscription ? "/dashboard" : "/");
        } else if (isDashboardRoute && !hasActiveSubscription && currentAppUser?.role !== "Admin") {
          // Block users without active subscription from dashboard
          console.warn("Access Denied: Active subscription required.");
          router.push("/");
        } else if (isLandingRoute) {
          // If on landing page, redirect based on role/subscription
          // UNLESS the user explicitly navigated here via ?view=landing bypass
          if (!isLandingBypass) {
            if (currentAppUser?.role === "Admin") {
              router.push("/admin");
            } else if (hasActiveSubscription) {
              router.push("/dashboard");
            }
          }
          // Else (inactive subscription OR bypass) - stay on Landing Page
        }
      }
    });

    return () => unsubscribe();
  }, [pathname, router, searchParams]);

  const logout = async () => {
    try {
      setLoading(true);
      await firebaseSignOut(auth);
      setUser(null);
      setAppUser(null);
      router.push("/"); // Redirect to landing page
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
