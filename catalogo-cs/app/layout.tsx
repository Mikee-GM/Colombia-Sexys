import type { Metadata } from "next";
import { Cinzel, Montserrat } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cinzel",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://rvcs-pruebas.com.mx";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Colombia Sexys | Catálogo Premium de Modelos",
  description:
    "Descubre el pináculo de la belleza colombiana. Nuestro exclusivo catálogo de modelos premium con elegancia, discreción y sofisticación de alta costura.",
  keywords:
    "modelos, colombia, catalogo premium, modelos colombianas, colombia sexys, agencia premium",
  openGraph: {
    title: "Colombia Sexys | Catálogo Premium de Modelos",
    description:
      "Descubre el pináculo de la belleza colombiana. Nuestro exclusivo catálogo de modelos premium con elegancia, discreción y sofisticación de alta costura.",
    url: siteUrl,
    siteName: "Colombia Sexys",
    type: "website",
    locale: "es_CO",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Colombia Sexys - Catálogo Premium",
        type: "image/jpeg",
      },
      {
        url: "/logo-horizontal.webp",
        width: 1200,
        height: 630,
        alt: "Colombia Sexys - Catálogo Premium",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Colombia Sexys | Catálogo Premium de Modelos",
    description:
      "Descubre el pináculo de la belleza colombiana. Nuestro exclusivo catálogo de modelos premium con elegancia, discreción y sofisticación de alta costura.",
    images: ["/og-image.jpg"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logo-icono.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${cinzel.variable} ${montserrat.variable}`}>
      <body className="bg-black text-white font-body antialiased">
        {children}
      </body>
    </html>
  );
}
