import type { Metadata } from "next";
import "./globals.css";
import { ChatStoreProvider } from "@/lib/chat-store";

export const metadata: Metadata = {
  title: "Edit",
  description: "AI-powered coding assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="antialiased h-screen dark"
        style={{ fontFamily: "'Geist', sans-serif" }}>
        <ChatStoreProvider>{children}</ChatStoreProvider>
      </body>
    </html>
  );
}
