import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "PolicySense",
  description: "Ask policy questions. Get answers you can verify.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">
        {/* Google Identity Services SDK, used by <GoogleButton /> on the
            signin/signup pages. Loaded once here so it's ready before any
            page tries to call window.google.accounts.id.* */}
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}