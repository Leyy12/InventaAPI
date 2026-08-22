import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import AdminLayoutWrapper from "@/components/layout/AdminLayoutWrapper";
import { AdminAuthProvider } from "@/lib/firebase/admin-auth-context";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "InventaAPI - Admin Panel",
  description: "Super Admin Control Panel for DaaS Platform Management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased bg-[#090d16] text-slate-50 overflow-x-hidden`}>
        <Suspense fallback={null}>
          <AdminAuthProvider>
            {/* Ambient background blobs */}
            <div className="blob blob-1" />
            <div className="blob blob-2" />
            
            <AdminLayoutWrapper>
              {children}
            </AdminLayoutWrapper>
          </AdminAuthProvider>
        </Suspense>
      </body>
    </html>
  );
}
