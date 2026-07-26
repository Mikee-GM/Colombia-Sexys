import PageHeader from "@/components/ui/page-header";
import ServicesTable from "@/components/services/services-table";
import { getServices } from "@/lib/data/services";

export default async function ServicesPage() {
  const services = await getServices();

  return (
    <>
      <PageHeader
        title="Servicios"
        description="Gestionar servicios activos y completados."
      />

      <ServicesTable initialServices={services} />
    </>
  );
}