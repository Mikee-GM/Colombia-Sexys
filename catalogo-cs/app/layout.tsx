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

export const metadata: Metadata = {
  metadataBase: new URL("https://colombiasexys.com"),
  title: "Colombia Sexys | Catalogo Premium de Modelos",
  description:
    "Descubre nuestro exclusivo catalogo de modelos premium. Elegancia, sofisticacion y belleza colombiana.",
  keywords:
    "modelos, colombia, catalogo premium, modelos colombianas, colombia sexys",
  openGraph: {
    title: "Colombia Sexys | Catalogo Premium de Modelos",
    description:
      "Descubre nuestro exclusivo catalogo de modelos premium. Elegancia, sofisticacion y belleza colombiana.",
    url: "https://colombiasexys.com",
    siteName: "Colombia Sexys",
    type: "website",
    locale: "es_CO",
    images: [
      {
        url: "/logo-horizontal.webp",
        width: 1200,
        height: 630,
        alt: "Colombia Sexys -- Catalogo Premium",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Colombia Sexys | Catalogo Premium de Modelos",
    description:
      "Descubre nuestro exclusivo catalogo de modelos premium. Elegancia, sofisticacion y belleza colombiana.",
    images: ["/logo-horizontal.webp"],
  },
  icons: {
    icon: "/logo-icono.webp",
    shortcut: "/logo-icono.webp",
    apple: "/logo-icono.webp",
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
