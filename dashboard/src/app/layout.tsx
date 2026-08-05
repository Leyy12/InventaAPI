import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import LayoutWrapper from "@/components/layout/LayoutWrapper";
import { AuthProvider } from "@/lib/firebase/auth-context";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "InventaAPI - Dashboard",
  description: "API-Based Data-as-a-Service Platform Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased bg-slate-950 text-slate-50 overflow-x-hidden`}>
        <Suspense fallback={null}>
          <AuthProvider>
            {/* Ambient background blobs */}
            <div className="blob blob-1" />
            <div className="blob blob-2" />
            
            <LayoutWrapper>
              {children}
            </LayoutWrapper>
          </AuthProvider>
        </Suspense>
      </body>
    </html>
  );
}
