import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/toaster";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["wdth", "opsz"],
  variable: "--font-bricolage",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "GatePass — concert tickets and QR entry", template: "%s · GatePass" },
  description:
    "Sell tickets for college concerts and gigs without overselling, take payments through Razorpay, and check people in with a phone camera.",
  applicationName: "GatePass",
};

export const viewport: Viewport = {
  themeColor: "#f4f0e8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Light is the designed default; a saved "dark" or "auto" choice is applied before first paint.
const themeScript = `try{var t=localStorage.getItem("gp-theme");if(t==="dark")document.documentElement.dataset.theme="dark";else if(t==="auto")delete document.documentElement.dataset.theme}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" data-theme="light" className={`${bricolage.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* Browser extensions (e.g. Grammarly) add attributes to <body> before hydration. */}
      <body suppressHydrationWarning>
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
