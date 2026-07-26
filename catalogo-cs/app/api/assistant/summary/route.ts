import { NextResponse } from "next/server";

import { getDrivers } from "@/lib/data/drivers";
import { getEmployees } from "@/lib/data/employees";

export async function GET() {
  const [employees, drivers] = await Promise.all([getEmployees(), getDrivers()]);

  return NextResponse.json({
    employees: {
      total: employees.length,
      available: employees.filter((employee) => employee.disponible).length,
    },
    drivers: {
      total: drivers.length,
      available: drivers.filter((driver) => driver.disponible).length,
    },
  });
}
