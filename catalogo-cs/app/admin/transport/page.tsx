import PageHeader from "@/components/ui/page-header";
import TransportConfigurationClient from "@/components/admin/transport-configuration-client";
import { getTransportConfiguration } from "./actions";
import { getCashObligations, getDriverSettlements } from "./actions";
import OperationalSettlementsClient from "@/components/admin/operational-settlements-client";

export default async function TransportPage() {
  const today = new Date();
  const day = today.getUTCDay() || 7;
  const monday = new Date(today); monday.setUTCDate(today.getUTCDate() - day + 1);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  const startDate = monday.toISOString().slice(0, 10);
  const endDate = sunday.toISOString().slice(0, 10);
  const [configuration, cash, trips] = await Promise.all([getTransportConfiguration(), getCashObligations(), getDriverSettlements(startDate, endDate)]);
  return <><PageHeader title="Transporte" description="Configura destinos, tarifa externa y reglas operativas."/><TransportConfigurationClient initial={configuration}/><div className="my-10 border-t border-zinc-800"/><OperationalSettlementsClient cash={cash} trips={trips} startDate={startDate} endDate={endDate}/></>;
}
