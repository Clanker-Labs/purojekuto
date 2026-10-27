import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";

export const dynamic = "force-dynamic";

const grotesk = localFont({
  src: [
    { path: "./fonts/space-grotesk-latin.woff2", weight: "300 700", style: "normal" },
    { path: "./fonts/space-grotesk-latin-ext.woff2", weight: "300 700", style: "normal" },
  ],
  variable: "--font-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "purojekuto", template: "%s · purojekuto" },
  description: "Your personal projects — specs, boards, shopping lists and work sessions, on your own machine.",
  applicationName: "purojekuto",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Home Screen app on iPhone: full screen, status bar over our own background.
  appleWebApp: { capable: true, title: "purojekuto", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false, address: false, email: false, date: false },
  other: { "mobile-web-app-capable": "yes" },
};

// Matches --page so the browser chrome and the iOS status bar blend in.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1419" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Apply a stored theme before first paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem("puro-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={grotesk.variable}>
      <body>
        <Script id="puro-theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
