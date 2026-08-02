"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./config";
import { useRouter, usePathname } from "next/navigation";

interface AdminUser {
  uid: string;
  email: string;
  fullName: string;
  role: string;
  plan: string;
  businessName: string;
}

interface AdminAuthContextType {
  user: User | null;
  adminUser: AdminUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType>({
  user: null,
  adminUser: null,
  loading: true,
  logout: async () => {},
});

export const useAdminAuth = () => useContext(AdminAuthContext);

export const AdminAuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Listen to auth state changes
  useEffect(() => {
    console.log("[ADMIN AUTH] 👂 Setting up auth state listener...");
    console.log("[ADMIN AUTH] Current pathname:", pathname);
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("[ADMIN AUTH] 🔄 Auth state changed:", !!currentUser);
      
      setUser(currentUser);

      if (currentUser) {
        try {
          console.log("[ADMIN AUTH] 📄 Fetching user data from Firestore...");
          
          // Fetch user data from Firestore
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            
            console.log("[ADMIN AUTH] ✅ User data loaded");
            console.log("[ADMIN AUTH] Role:", userData.role);

            // Verify admin role (case-insensitive)
            if (userData.role?.toLowerCase() === "admin") {
              setAdminUser({
                uid: currentUser.uid,
                email: currentUser.email || "",
                fullName: userData.fullName || "Admin",
                role: userData.role,
                plan: userData.plan || "Unlimited",
                businessName: userData.businessName || "InventaAPI",
              });
              
              console.log("[ADMIN AUTH] ✅ Admin access granted");
              
              // If currently on login page and authenticated, redirect to dashboard
              if (pathname === "/login") {
                console.log("[ADMIN AUTH] 🔄 Redirecting to admin dashboard...");
                router.push("/");
              }
            } else {
              // Not an admin - sign out and redirect to login
              console.warn("[ADMIN AUTH] ❌ Not an admin role:", userData.role);
              console.warn("[ADMIN AUTH] Expected: 'admin' (any case), Got:", userData.role);
              
              await auth.signOut();
              setAdminUser(null);
              
              // Redirect to login page with generic error (no hint about role)
              console.log("[ADMIN AUTH] 🔄 Redirecting to login page...");
              router.push("/login");
            }
          } else {
            // User document not found
            console.error("[ADMIN AUTH] ❌ User document not found in Firestore");
            await auth.signOut();
            setAdminUser(null);
            
            // Redirect to login page
            console.log("[ADMIN AUTH] 🔄 Redirecting to login page...");
            router.push("/login");
          }
        } catch (error) {
          console.error("[ADMIN AUTH] ❌ Error loading user data:", error);
          
          // On error, sign out and redirect to login
          await auth.signOut();
          setAdminUser(null);
          router.push("/login");
        }
      } else {
        // No user session detected
        console.log("[ADMIN AUTH] ⚠️ No user session detected");
        
        // Only redirect to login if NOT already on the login page
        if (pathname !== "/login") {
          console.log("[ADMIN AUTH] 🔄 Redirecting to login page...");
          router.push("/login");
        } else {
          console.log("[ADMIN AUTH] ✓ Already on login page, no redirect needed");
        }
      }

      setLoading(false);
    });

    return () => {
      console.log("[ADMIN AUTH] 🔌 Cleaning up auth listener...");
      unsubscribe();
    };
  }, [pathname, router]);

  const logout = async () => {
    try {
      console.log("[ADMIN AUTH] 🚪 Logging out...");
      
      await auth.signOut();
      setUser(null);
      setAdminUser(null);
      
      console.log("[ADMIN AUTH] ✅ Logout successful");
      
      // Redirect to login page
      router.push("/login");
    } catch (error) {
      console.error("[ADMIN AUTH] ❌ Logout error:", error);
    }
  };

  return (
    <AdminAuthContext.Provider value={{ user, adminUser, loading, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
};
