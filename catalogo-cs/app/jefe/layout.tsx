import type { Metadata } from "next";
import { Toaster } from "sonner";
import JefeLayoutClient from "@/components/jefe/JefeLayoutClient";

/*
 * El manifiesto se declara aqui y no en el layout raiz: el catalogo publico no
 * tiene por que ofrecerse como aplicacion instalable, y su `start_url` apunta
 * al panel. En iPhone, ademas, instalarlo es la unica forma de recibir avisos
 * push, asi que `appleWebApp` no es un adorno.
 */
export const metadata: Metadata = {
  title: "Panel de jefe -- Colombia Sexys",
  robots: "noindex, nofollow",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Panel CS", statusBarStyle: "black-translucent" },
};

export default function JefeLayout({ children }: { children: React.ReactNode }) {
  return <JefeLayoutClient>{children}<Toaster theme="dark" position="bottom-right" richColors /></JefeLayoutClient>;
}
