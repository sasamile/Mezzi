import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Inter, Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import { resolveSiteMetadata } from "@/lib/site-branding";
import "./globals.css";
import { Providers } from "./providers";
import { AuthProvider } from "@/lib/auth-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export async function generateMetadata(): Promise<Metadata> {
  const hostHeader = (await headers()).get("host") ?? "";
  const meta = await resolveSiteMetadata(hostHeader);
  const protocol = hostHeader.includes("localhost") ? "http" : "https";
  return {
    ...meta,
    metadataBase: new URL(`${protocol}://${hostHeader || "localhost"}`),
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@100..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${instrumentSerif.variable} ${jakarta.variable} antialiased font-sans`}
        suppressHydrationWarning
      >
        <Providers>
          <AuthProvider>{children}</AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
