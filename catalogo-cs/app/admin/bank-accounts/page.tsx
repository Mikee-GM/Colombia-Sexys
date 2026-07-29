import PageHeader from "@/components/ui/page-header";
import BankAccountsClient from "@/components/admin/bank-accounts-client";
import { getBankAccounts } from "./actions";

export default async function BankAccountsPage() {
  const accounts = await getBankAccounts();
  return (
    <>
      <PageHeader
        title="Cuentas de transferencia"
        description="Administra las cuentas que el bot comparte con los clientes."
      />
      <BankAccountsClient initialAccounts={accounts} />
    </>
  );
}
