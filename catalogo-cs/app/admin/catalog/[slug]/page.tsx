import PageHeader from "@/components/ui/page-header";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function CatalogDetailPage({ params }: Props) {
  const { slug } = await params;

  return (
    <PageHeader
      title={slug}
      description="El perfil del catalogo esta pendiente de integracion con el backend."
    />
  );
}
