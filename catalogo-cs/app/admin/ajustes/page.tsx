import PaginaDeAvisos from "@/components/ui/PaginaDeAvisos";

export const metadata = {
  title: "Aplicación y notificaciones -- Administración",
};

export default function AdminSettingsPage() {
  return (
    <PaginaDeAvisos
      volverA="/admin/dashboard"
      volverTexto="Centro de mando"
    />
  );
}
