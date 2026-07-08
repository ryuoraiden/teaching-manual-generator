import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_Malayalam } from "next/font/google";
import "./globals.css";

// Noto Sans (Latin) + Noto Sans Malayalam so the editor UI renders both
// scripts correctly. The browser picks the right font per glyph via the
// CSS font stack in globals.css.
const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
});

const notoSansMalayalam = Noto_Sans_Malayalam({
  variable: "--font-noto-sans-malayalam",
  subsets: ["malayalam", "latin"],
});

export const metadata: Metadata = {
  title: "Teaching Manual Generator",
  description:
    "Generate structured teaching manuals for the Kerala state syllabus (Standards I–VII) in Malayalam and English.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${notoSans.variable} ${notoSansMalayalam.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        {children}
      </body>
    </html>
  );
}
