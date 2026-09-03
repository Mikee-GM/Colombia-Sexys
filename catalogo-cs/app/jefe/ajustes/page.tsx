import PaginaDeAvisos from "@/components/ui/PaginaDeAvisos";

export const metadata = {
  title: "Avisos -- Panel de jefe",
  robots: "noindex, nofollow",
};

export default function JefeAjustesPage() {
  return <PaginaDeAvisos volverA="/jefe" volverTexto="Mi equipo" />;
}
