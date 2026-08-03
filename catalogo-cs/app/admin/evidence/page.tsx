import PageHeader from "@/components/ui/page-header";
import EvidenceClient from "@/components/admin/evidence-client";
import { getEvidence } from "@/lib/actions/evidence";

export default async function EvidencePage() {
  const initialPage = await getEvidence();
  return (
    <>
      <PageHeader title="Evidencias" description="Capturas de Uber y comprobantes de transferencia almacenados en la nube." />
      <EvidenceClient initialPage={initialPage} />
    </>
  );
}
