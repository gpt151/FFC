import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "LytPay 红包",
  description: "Lyt IT Pay 红包收发与激活码领取",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="light" data-theme="light">
      <body className="min-h-screen flex flex-col bg-[#fafafa] text-zinc-900">
        <Navbar />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {children}
        </main>
        <footer className="py-6 text-center text-xs text-zinc-400">
          LytPay Red Packet
        </footer>
      </body>
    </html>
  );
}
