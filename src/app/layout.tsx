import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import AppleSplash from "@/components/AppleSplash";
import PwaLayer from "@/components/PwaLayer";
import "./globals.css";

const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--font-plex",
});

export const metadata: Metadata = {
  title: "مسبحة الروح القدس",
  description:
    "مسبحة الروح القدس ومسبحة مريم — تطبيق صلاة تفاعلي بالعربية والإنجليزية.",
  applicationName: "مسبحة",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "مسبحة",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  other: {
    // Next emits only `mobile-web-app-capable`; iOS before 17.4 needs the
    // apple-prefixed name to launch standalone instead of inside Safari.
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/favicon-16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Lets the layout paint under the notch and the home bar.
  viewportFit: "cover",
  themeColor: "#070a15",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={plex.variable}>
      <head>
        <AppleSplash />
      </head>
      <body>
        {children}
        <PwaLayer />
        {/* Vercel's own page counts. Cookieless, and it no-ops off Vercel, so
            local runs and any other host stay clean. */}
        <Analytics />
      </body>
    </html>
  );
}
