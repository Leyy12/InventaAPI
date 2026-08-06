"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./config";
import { useRouter } from "next/navigation";

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

  // Listen to auth state changes ONCE — do NOT include pathname/router in deps,
  // otherwise the listener re-runs on every page navigation causing a flicker.
  useEffect(() => {
    console.log("[ADMIN AUTH] 👂 Setting up auth state listener...");
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("[ADMIN AUTH] 🔄 Auth state changed:", !!currentUser);
      
      setUser(currentUser);

      if (currentUser) {
        try {
          console.log("[ADMIN AUTH] 📄 Fetching user data from Firestore...");
          
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            
            console.log("[ADMIN AUTH] ✅ User data loaded");
            console.log("[ADMIN AUTH] Role:", userData.role);

            if (userData.role?.toLowerCase() === "admin") {
              // Determine display name: prefer fullName from Firestore,
              // then displayName from Firebase Auth, then "Super Admin" for admin role
              const displayName = userData.fullName
                || currentUser.displayName
                || (userData.role?.toLowerCase() === "admin" ? "Super Admin" : "User");

              setAdminUser({
                uid: currentUser.uid,
                email: currentUser.email || "",
                fullName: displayName,
                role: userData.role,
                plan: userData.plan || "Unlimited",
                businessName: userData.businessName || "InventaAPI",
              });
              
              console.log("[ADMIN AUTH] ✅ Admin access granted, displayName:", displayName);
            } else {
              console.warn("[ADMIN AUTH] ❌ Not an admin role:", userData.role);
              await auth.signOut();
              setAdminUser(null);
              router.push("/login");
            }
          } else {
            console.error("[ADMIN AUTH] ❌ User document not found in Firestore");
            await auth.signOut();
            setAdminUser(null);
            router.push("/login");
          }
        } catch (error) {
          console.error("[ADMIN AUTH] ❌ Error loading user data:", error);
          await auth.signOut();
          setAdminUser(null);
          router.push("/login");
        }
      } else {
        console.log("[ADMIN AUTH] ⚠️ No user session detected");
        setAdminUser(null);
        // Use the ref approach to get latest pathname without adding it as a dep
        if (window.location.pathname !== "/login") {
          router.push("/login");
        }
      }

      setLoading(false);
    });

    return () => {
      console.log("[ADMIN AUTH] 🔌 Cleaning up auth listener...");
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps: only run once on mount, not on every navigation

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
