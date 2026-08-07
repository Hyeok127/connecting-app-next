import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ToastProvider } from "@/components/Toast";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "인연 💝",
  description: "사진 대신 맥락으로, 하루 한 번. 초대제 기반 소개팅 인연",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="preconnect"
          href="https://cdn.jsdelivr.net"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full bg-slate-50 text-slate-900">
        <AuthProvider>
          <ToastProvider>
            <Header />
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
