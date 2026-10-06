import EmployeeOperationSections from "./EmployeeOperationSections";
import type { OperationSection } from "./today-model";

export default function AllOperationsRadar({
  sections,
  selectedId,
  onSelect,
}: {
  sections: OperationSection[];
  selectedId: string | null;
  onSelect: (conversationId: string) => void;
}) {
  return (
    <div>
      <div className="border-b border-zinc-900 bg-zinc-950/40 px-3 py-2.5">
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Prioridades del equipo que requieren seguimiento ahora.
        </p>
      </div>
      <EmployeeOperationSections
        sections={sections}
        selectedId={selectedId}
        showEmployee
        onSelect={onSelect}
      />
    </div>
  );
}
