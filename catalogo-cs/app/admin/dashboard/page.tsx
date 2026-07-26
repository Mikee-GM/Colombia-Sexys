import { BriefcaseBusiness, Car, Users } from "lucide-react";

import ActivityFeed from "@/components/dashboard/activity-feed";
import LiveMapDynamic from "@/components/dashboard/LiveMapDynamic";
import PageHeader from "@/components/ui/page-header";
import StatCard from "@/components/ui/stat-card";
import { getDrivers } from "@/lib/data/drivers";
import { getEmployees } from "@/lib/data/employees";
import { getServices, isActiveService } from "@/lib/data/services";

export default async function DashboardPage() {
  const [employees, drivers, servicesResult] = await Promise.all([
    getEmployees(),
    getDrivers(),
    getServices().then(
      (services) => ({ ok: true as const, services }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
  ]);
  const services = servicesResult.ok ? servicesResult.services : [];
  const activeServices = services.filter(isActiveService);

  return (
    <>
      <PageHeader
        title="Panel General"
        description="Metricas en tiempo real y estado de la flota."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard
          title="Servicios Activos"
          value={servicesResult.ok ? activeServices.length : "—"}
          icon={BriefcaseBusiness}
        />
        <StatCard title="Empleadas" value={employees.length} icon={Users} />
        <StatCard title="Choferes" value={drivers.length} icon={Car} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <LiveMapDynamic employees={employees} drivers={drivers} />
        </div>

        <div className="xl:col-span-4">
          <ActivityFeed
            services={services}
            error={
              servicesResult.ok
                ? undefined
                : "No se pudieron cargar servicios. Revisa que haya sesion admin/jefe."
            }
          />
        </div>
      </div>
    </>
  );
}
