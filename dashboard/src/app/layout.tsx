import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import "./theme.css"; // light mode (after globals so it wins)
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import LayoutWrapper from "@/components/layout/LayoutWrapper";
import AppDialogHost from "@/components/shared/AppDialog";
import { AuthProvider } from "@/lib/firebase/auth-context";
import { PlanRequestPolicyProvider } from '@/lib/plan-request-policy';

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
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Applies a saved light/dark choice before the page paints. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased bg-slate-950 text-slate-50 overflow-x-hidden`}>
        <Suspense fallback={null}>
          <AuthProvider>
            {/* Ambient background blobs */}
            <div className="blob blob-1" />
            <div className="blob blob-2" />
            
            <PlanRequestPolicyProvider><LayoutWrapper>
              {children}
            </LayoutWrapper></PlanRequestPolicyProvider>
            <AppDialogHost />
          </AuthProvider>
        </Suspense>
      </body>
    </html>
  );
}
