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

/* One name, in one language, everywhere the device shows it: the home screen,
   the task switcher, the browser tab, the install sheet. The prayers stay
   bilingual — this is the app's name, not its content. */
const APP_NAME = "Unified Prayers";

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    "An interactive rosary in Arabic and English — the Holy Spirit chaplet and the Marian rosary, and both of them offline.",
  applicationName: APP_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: APP_NAME,
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
  themeColor: "#070c18",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={plex.variable}>
      <head>
        <AppleSplash />
        {/* The tab bar hugs the bottom edge on iOS and keeps the system
            inset everywhere else -- Android and Windows put their own
            navigation there and would cover it. The flag has to land
            before the first paint, so it is a blocking script rather than
            an effect. */}
        {/* data-ios-gap: an installed iPhone app that iOS has handed a
            viewport shorter than the screen. Measured on an iPhone 13 with
            iOS 26: screen 844, viewport 797 — short by exactly the status
            bar — and the missing 47 points under it are not part of the page
            at all: nothing drawn there shows, so stretching into it only
            pushed the tab labels out of sight. iOS fills that strip with the
            page's ground colour, so globals.css ends the tab bar in the same
            colour and the strip reads as the bar's own lower half. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var n=navigator,d=document.documentElement;if(/iphone|ipad|ipod/i.test(n.userAgent)||" +
              "(n.platform==='MacIntel'&&n.maxTouchPoints>1)){d.dataset.ios='';" +
              "var gap=function(){var s=n.standalone===true||matchMedia('(display-mode: standalone)').matches;" +
              "var g=Math.max(screen.width,screen.height)-innerHeight;" +
              // Only ever set, never cleared: while iOS settles a launch it
              // can report the full height for a moment and then keep the
              // short one, and clearing the mark on that moment left the bar
              // unblended for the rest of the session.
              "if(s&&innerHeight>innerWidth&&g>=20&&g<=80)d.dataset.iosGap='';};" +
              "gap();addEventListener('resize',gap);addEventListener('pageshow',gap);}}catch(e){}",
          }}
        />
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
