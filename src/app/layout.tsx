import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Sans_Malayalam } from "next/font/google";
import "./globals.css";
import InstallPrompt from "@/components/InstallPrompt";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

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
  applicationName: "Teaching Manual",
  // iOS has no install prompt: these make "Add to Home Screen" launch
  // fullscreen with the right icon and title.
  appleWebApp: {
    capable: true,
    title: "Teaching Manual",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

/**
 * Next 16 requires viewport/themeColor as a separate `viewport` export
 * (they are no longer valid inside `metadata`).
 * `viewportFit: "cover"` + safe-area padding in globals.css keeps the UI clear
 * of notches when running as an installed app.
 */
export const viewport: Viewport = {
  themeColor: "#047857",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        <ServiceWorkerRegistrar />
        <InstallPrompt />
      </body>
    </html>
  );
}
