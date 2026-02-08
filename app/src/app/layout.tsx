import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConfigProvider } from "@/context/ConfigProvider";
import { WalletProvider } from "@/context/WalletContext";
import Header from "@/components/Header";
import AppShell from "@/components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FhenixEscrow",
  description: "Secure, private, milestone-based escrow with on-chain enforcement",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[var(--bg-primary)] text-[var(--text-primary)]`}
        style={{ backgroundColor: "#0a0a0f", color: "#ffffff" }}
      >
        <AppShell>
          <ConfigProvider>
            <WalletProvider>
              <Header />
              {children}
            </WalletProvider>
          </ConfigProvider>
        </AppShell>
      </body>
    </html>
  );
}
