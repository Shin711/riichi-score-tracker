import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Riichi Score Tracker",
  description: "Track Riichi Mahjong sessions and scores.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="border-b border-zinc-200/70 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/60">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Riichi Score Tracker
            </Link>
            <nav className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-300">
              <Link className="hover:text-zinc-950 dark:hover:text-white" href="/players">
                Players
              </Link>
              <Link className="hover:text-zinc-950 dark:hover:text-white" href="/my/sessions">
                My sessions
              </Link>
              <Link className="hover:text-zinc-950 dark:hover:text-white" href="/login">
                Account
              </Link>
            </nav>
          </div>
        </div>
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</div>
      </body>
    </html>
  );
}
