import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "LytPay 红包 | Lyt IT Pay 社交红包与激活码平台",
  description:
    "基于 Lyt IT Pay 的安全红包平台：在线包红包生成官方收款链接，付款后自动生成红包激活码与领取链接，实时到账可追溯。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="light" data-theme="light">
      <body className="min-h-screen text-foreground antialiased flex flex-col">
        <Navbar />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          {children}
        </main>
        <footer className="border-t border-black/5 py-6 text-center text-xs text-muted">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>LytPay 红包平台 · 基于 Lyt IT Pay 官方接口构建</span>
            <span>安全托管收款 · 自动到账 · 实时数据看板</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
