import type { Metadata, Viewport } from "next";
import { Cinzel, Montserrat } from "next/font/google";
import "./globals.css";

/**
 * `viewportFit: "cover"` es lo que hace que existan las variables
 * `env(safe-area-inset-*)`.
 *
 * Sin esta declaracion Next emite el viewport por defecto, que no la lleva, y
 * entonces `env(safe-area-inset-bottom)` vale 0 en todos los navegadores. Las
 * barras de navegacion inferiores de los paneles reservan su hueco con
 * `pb-[max(...,env(safe-area-inset-bottom))]`, asi que ese calculo se quedaba
 * siempre en el minimo: en un iPhone, con el panel instalado en la pantalla de
 * inicio, los iconos quedaban pisados por el indicador de inicio y parecia que
 * la barra no cabia en la pantalla.
 *
 * `themeColor` pinta de negro la franja del sistema, que sin el sale blanca y
 * rompe el fondo negro de la marca.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

// Autoalojadas por next/font: sin peticion a fonts.googleapis.com, con
// preload y metricas de fallback ajustadas para no provocar CLS.
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-cinzel",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-montserrat",
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
