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
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var n=navigator;if(/iphone|ipad|ipod/i.test(n.userAgent)||" +
              "(n.platform==='MacIntel'&&n.maxTouchPoints>1))" +
              "document.documentElement.dataset.ios='';}catch(e){}",
          }}
        />
      </head>
      <body>
        {/* iOS home-screen apps only: the gap iOS leaves at the bottom.

            With the status bar translucent, iOS can hand an installed web
            app a viewport that is short by exactly the status bar's height
            while still drawing it from the top of the screen — so everything
            pinned to the bottom, the tab bar first, floats that far up over a
            dead strip. Measured rather than assumed: a hidden full-height
            probe says how tall the viewport really is, and the difference
            from the screen becomes --ios-gap, which globals.css adds back.
            When iOS gets it right the difference is zero and this does
            nothing. Safari, Android and desktop never run it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var d=document.documentElement;if(!('ios' in d.dataset))return;" +
              "var n=navigator;if(!(n.standalone===true||matchMedia('(display-mode: standalone)').matches))return;" +
              "var p=document.createElement('div');p.style.cssText='position:fixed;top:0;bottom:0;width:0;visibility:hidden;pointer-events:none';" +
              "function fix(){if(!p.isConnected)document.body.appendChild(p);" +
              "var h=p.getBoundingClientRect().height,s=Math.max(screen.width,screen.height),g=Math.round(s-h);" +
              "if(innerWidth>innerHeight||g<1||g>80)g=0;d.style.setProperty('--ios-gap',g+'px');}" +
              "fix();addEventListener('resize',fix);addEventListener('orientationchange',fix);addEventListener('pageshow',fix);})();",
          }}
        />
        {children}
        <PwaLayer />
        {/* Vercel's own page counts. Cookieless, and it no-ops off Vercel, so
            local runs and any other host stay clean. */}
        <Analytics />
      </body>
    </html>
  );
}
