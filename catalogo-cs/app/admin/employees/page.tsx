import EmployeeCard from "@/components/employees/employee-card";
import PageHeader from "@/components/ui/page-header";
import { getEmployees } from "@/lib/data/employees";

export default async function EmployeesPage() {
  const employees = await getEmployees();

  return (
    <>
      <PageHeader
        title="Empleadas"
        description={`${employees.length} perfiles cargados desde BackendCitas.`}
      />

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {employees.map((employee) => (
          <EmployeeCard
            key={employee.id}
            id={employee.id}
            name={employee.nombreArtistico}
            realName={employee.nombreReal}
            photoUrl={employee.fotoPerfilUrl}
            pricePerHour={employee.precioBaseHora}
            available={employee.disponible}
            catalogActive={employee.catalogoActivo}
          />
        ))}
      </div>
    </>
  );
}
