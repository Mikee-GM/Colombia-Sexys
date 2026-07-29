"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";

export type BankAccount = {
  id: string;
  banco: string;
  titular: string;
  cuenta?: string | null;
  ultimos4?: string | null;
  clabe?: string | null;
  alias?: string | null;
  activa: boolean;
};

export type BankAccountInput = Omit<BankAccount, "id">;

export async function getBankAccounts() {
  return apiFetch<BankAccount[]>("/services/bank-accounts");
}

export async function saveBankAccount(
  id: string | null,
  input: BankAccountInput,
) {
  const result = await apiFetch<BankAccount>(
    id ? `/services/bank-accounts/${id}` : "/services/bank-accounts",
    {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(input),
    },
  );
  revalidatePath("/admin/bank-accounts");
  return result;
}

export async function deleteBankAccount(id: string) {
  await apiFetch(`/services/bank-accounts/${id}`, { method: "DELETE" });
  revalidatePath("/admin/bank-accounts");
}
