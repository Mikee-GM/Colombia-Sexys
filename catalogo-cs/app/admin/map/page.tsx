import LiveMapDynamic from "@/components/dashboard/LiveMapDynamic";
import PageHeader from "@/components/ui/page-header";
import { getDrivers } from "@/lib/data/drivers";
import { getEmployees } from "@/lib/data/employees";

export default async function MapPage() {
  const [employees, drivers] = await Promise.all([getEmployees(), getDrivers()]);

  return (
    <>
      <PageHeader
        title="Mapa en Tiempo Real"
        description=""
      />

      <LiveMapDynamic employees={employees} drivers={drivers} />
    </>
  );
}
