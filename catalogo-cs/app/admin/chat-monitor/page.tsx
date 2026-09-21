import PageHeader from "@/components/ui/page-header";
import ChatMonitorClient from "@/components/erp/chat-monitor-client";

export default function ChatMonitorPage() {
  return (
    <div className="flex flex-col h-full gap-6">
      <PageHeader
        title="Monitor de conversaciones"
        description="Bandeja de entrada para observar y controlar las conversaciones del bot."
      />
      <ChatMonitorClient />
    </div>
  );
}
