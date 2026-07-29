import type { MetadataRoute } from "next";

/**
 * Web app manifest — makes the site installable as an app.
 *
 * Android/Chrome: shows an "Install app" prompt (needs name, a 192 and a 512
 * icon, start_url, and display: standalone, plus a service worker with a fetch
 * handler — see public/sw.js).
 * iOS/Safari: no install prompt exists; users "Add to Home Screen" and iOS
 * reads apple-touch-icon + the appleWebApp metadata in layout.tsx.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Teaching Manual Generator",
    short_name: "Teaching Manual",
    description:
      "Generate Kerala SCERT teaching manuals (അധ്യാപന സഹായി) in Malayalam and English from a textbook and teacher handbook.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafafa",
    theme_color: "#047857",
    lang: "ml",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
