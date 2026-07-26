import { DollarSign, Wallet, CreditCard, Activity, ArrowRightLeft, Car } from "lucide-react";
import StatCard from "@/components/ui/stat-card";
import { formatCurrency } from "@/lib/calculations";
import type { CutResult } from "./types";

interface Props {
  cut: CutResult;
  employeeName: string;
}

export default function LiquidationSummary({ cut, employeeName }: Props) {
  if (!cut) return null;

  return (
    <div className="space-y-5">
      <h3 className="font-serif text-xl font-semibold leading-tight text-brand-gold">
        Resumen: {employeeName}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
        <StatCard
          title="Venta Total"
          value={formatCurrency(cut.salesTotal)}
          icon={DollarSign}
          variant="compact"
        />
        <StatCard
          title={
            cut.direction === "employee_owes_company"
              ? "Debe a oficina"
              : cut.direction === "company_owes_employee"
                ? "Pagar a empleada"
                : "Corte saldado"
          }
          value={formatCurrency(Math.abs(cut.result))}
          icon={Activity}
          variant="compact"
        />
        <StatCard
          title="Efectivo"
          value={formatCurrency(cut.cashTotal)}
          icon={Wallet}
          variant="compact"
        />
        <StatCard
          title="Tarjeta"
          value={formatCurrency(cut.cardTotal)}
          icon={CreditCard}
          variant="compact"
        />
        <StatCard
          title="Membresía"
          value={formatCurrency(cut.membershipTotal)}
          icon={ArrowRightLeft}
          variant="compact"
        />
        <StatCard
          title="Reembolso de Uber"
          value={formatCurrency(cut.employeeUberReimbursements)}
          icon={Car}
          variant="compact"
        />
      </div>
    </div>
  );
}
