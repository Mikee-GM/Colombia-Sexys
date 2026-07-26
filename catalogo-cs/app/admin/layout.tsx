import type { Metadata } from "next";
import { Toaster } from "sonner";
import AdminLayoutClient from "@/components/admin/AdminLayoutClient";

export const metadata: Metadata = {
  title: "Panel de Administracion -- Colombia Sexys",
  description: "Panel de gestion de modelos para Colombia Sexys.",
  robots: "noindex, nofollow",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminLayoutClient>{children}</AdminLayoutClient>
      <Toaster theme="dark" position="bottom-right" richColors />
    </>
  );
}

