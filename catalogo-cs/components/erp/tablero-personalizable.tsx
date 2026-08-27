"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Eye, EyeOff, GripVertical, LayoutGrid, RotateCcw } from "lucide-react";

import {
  saveDashboardLayout,
  resetDashboardLayout,
  type DashboardLayout,
} from "@/lib/actions/dashboard-layout";

/**
 * Tablero reordenable del centro de mando.
 *
 * Se eligio dnd-kit y no la rejilla completa de react-grid-layout porque el
 * proyecto es mobile-first: dnd-kit responde al dedo y al teclado, pesa un
 * tercio, y redimensionar bloques en una pantalla de telefono no aporta nada.
 *
 * El modo de edicion es explicito. Con el arrastre siempre activo, un desliz
 * para hacer scroll en el movil terminaba moviendo un bloque sin querer.
 */

export type BloqueTablero = {
  id: string;
  /** Nombre legible; es lo que se ve en la lista de bloques ocultos. */
  titulo: string;
  contenido: ReactNode;
  /** Ocupa la fila entera. Los paneles anchos no comparten fila con nadie. */
  anchoCompleto?: boolean;
};

/**
 * Un grupo de bloques que se reordenan entre si.
 *
 * Existen dos: la fila de indicadores y los paneles. Se separan porque son
 * piezas de tamaños incompatibles --una tarjeta de KPI metida entre dos paneles
 * anchos queda ridicula-- pero comparten un unico ajuste guardado, de modo que
 * el administrador ve un solo tablero y no dos configuraciones sueltas.
 */
export type GrupoTablero = {
  id: string;
  bloques: BloqueTablero[];
  /** Clases de la rejilla del grupo. */
  gridClassName: string;
};

function ordenarBloques(
  bloques: BloqueTablero[],
  layout: DashboardLayout,
): { visibles: BloqueTablero[]; ocultos: BloqueTablero[] } {
  const posicion = new Map(layout.orden.map((id, indice) => [id, indice]));
  const ocultos = new Set(layout.ocultos);

  /*
   * Un bloque que no este en el orden guardado es uno que se añadio despues.
   * Va al final en vez de desaparecer: quien guardo su tablero hace meses tiene
   * que poder ver lo que se agrego desde entonces.
   */
  const ordenados = [...bloques].sort((a, b) => {
    const pa = posicion.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const pb = posicion.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return bloques.indexOf(a) - bloques.indexOf(b);
  });

  return {
    visibles: ordenados.filter((bloque) => !ocultos.has(bloque.id)),
    ocultos: ordenados.filter((bloque) => ocultos.has(bloque.id)),
  };
}

function BloqueArrastrable({
  bloque,
  editando,
  onOcultar,
}: {
  bloque: BloqueTablero;
  editando: boolean;
  onOcultar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: bloque.id, disabled: !editando });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={[
        bloque.anchoCompleto ? "col-span-full" : "",
        editando
          ? "relative rounded-2xl outline-dashed outline-1 outline-offset-4 outline-zinc-700"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {editando ? (
        <div className="absolute -top-3 right-3 z-10 flex items-center gap-1">
          <button
            type="button"
            onClick={onOcultar}
            title={`Ocultar ${bloque.titulo}`}
            className="rounded-lg border border-zinc-700 bg-zinc-950 p-1.5 text-zinc-400 transition-colors hover:text-white"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>

          {/*
            El asa es lo unico que inicia el arrastre. Si el bloque entero
            fuera arrastrable, no se podria seleccionar texto ni pulsar los
            enlaces que llevan dentro mientras se ordena.
          */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            title={`Mover ${bloque.titulo}`}
            className="cursor-grab rounded-lg border border-[#C5A55A]/40 bg-[#C5A55A]/10 p-1.5 text-[#E8D5A3] active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {bloque.contenido}
    </div>
  );
}

export default function TableroPersonalizable({
  grupos,
  layoutInicial,
}: {
  grupos: GrupoTablero[];
  /** Nulo si el administrador nunca lo toco: se usa el orden por defecto. */
  layoutInicial: DashboardLayout | null;
}) {
  const bloques = useMemo(
    () => grupos.flatMap((grupo) => grupo.bloques),
    [grupos],
  );

  const [editando, setEditando] = useState(false);
  const [layout, setLayout] = useState<DashboardLayout>(
    layoutInicial ?? { orden: bloques.map((bloque) => bloque.id), ocultos: [] },
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, startTransition] = useTransition();

  const sensors = useSensors(
    // Un umbral corto: sin el, un toque para pulsar dentro del bloque se
    // interpreta como arrastre en pantallas tactiles.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  /* Cada grupo se ordena por su cuenta, con el orden guardado como referencia. */
  const gruposOrdenados = useMemo(
    () =>
      grupos.map((grupo) => ({
        ...grupo,
        ...ordenarBloques(grupo.bloques, layout),
      })),
    [grupos, layout],
  );

  const ocultos = useMemo(
    () => gruposOrdenados.flatMap((grupo) => grupo.ocultos),
    [gruposOrdenados],
  );
  const hayVisibles = gruposOrdenados.some((grupo) => grupo.visibles.length > 0);

  const persistir = (siguiente: DashboardLayout) => {
    setLayout(siguiente);
    setError(null);
    startTransition(async () => {
      try {
        await saveDashboardLayout(siguiente);
      } catch {
        setError("No se pudo guardar la disposicion. Intenta de nuevo.");
      }
    });
  };

  const alSoltar = (evento: DragEndEvent) => {
    const { active, over } = evento;
    if (!over || active.id === over.id) return;

    /*
     * Un bloque solo se mueve dentro de su grupo: un indicador no tiene sentido
     * intercalado entre dos paneles anchos. Si el destino cae en otro grupo se
     * ignora el gesto en vez de dejar el tablero descuadrado.
     */
    const grupo = gruposOrdenados.find((candidato) =>
      candidato.visibles.some((bloque) => bloque.id === String(active.id)),
    );
    if (!grupo) return;

    const ids = grupo.visibles.map((bloque) => bloque.id);
    const desde = ids.indexOf(String(active.id));
    const hasta = ids.indexOf(String(over.id));
    if (desde < 0 || hasta < 0) return;

    const reordenados = arrayMove(ids, desde, hasta);

    /*
     * El orden se guarda como una sola lista, pero solo importa la posicion
     * relativa dentro de cada grupo: los grupos se dibujan por separado y en un
     * orden fijo. Reconstruirla concatenando grupo a grupo evita tener que
     * intercalar posiciones entre listas que nunca se mezclan.
     *
     * Los ocultos de cada grupo van detras de sus visibles, para que al volver
     * a mostrarlos aparezcan al final de su propio grupo y no del tablero.
     */
    const ordenGlobal = gruposOrdenados.flatMap((candidato) =>
      candidato.id === grupo.id
        ? [...reordenados, ...candidato.ocultos.map((bloque) => bloque.id)]
        : [
            ...candidato.visibles.map((bloque) => bloque.id),
            ...candidato.ocultos.map((bloque) => bloque.id),
          ],
    );

    persistir({ ...layout, orden: ordenGlobal });
  };

  const alternarVisibilidad = (id: string) => {
    const oculto = layout.ocultos.includes(id);
    persistir({
      orden: layout.orden.includes(id) ? layout.orden : [...layout.orden, id],
      ocultos: oculto
        ? layout.ocultos.filter((otro) => otro !== id)
        : [...layout.ocultos, id],
    });
  };

  const restaurar = () => {
    const porDefecto = {
      orden: bloques.map((bloque) => bloque.id),
      ocultos: [],
    };
    setLayout(porDefecto);
    setError(null);
    startTransition(async () => {
      try {
        await resetDashboardLayout();
      } catch {
        setError("No se pudo restaurar el tablero.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {error ? (
          <span className="mr-auto text-[11px] text-red-400">{error}</span>
        ) : guardando ? (
          <span className="mr-auto text-[11px] text-zinc-500">Guardando</span>
        ) : null}

        {editando ? (
          <button
            type="button"
            onClick={restaurar}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-400 transition-colors hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setEditando((actual) => !actual)}
          className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.05em] transition-colors ${
            editando
              ? "border-[#C5A55A] bg-[#C5A55A] text-black"
              : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:text-white"
          }`}
        >
          {editando ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Listo
            </>
          ) : (
            <>
              <LayoutGrid className="h-3.5 w-3.5" />
              Personalizar
            </>
          )}
        </button>
      </div>

      {editando && ocultos.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
            Ocultos
          </span>
          {ocultos.map((bloque) => (
            <button
              key={bloque.id}
              type="button"
              onClick={() => alternarVisibilidad(bloque.id)}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-[#C5A55A]/40 hover:text-[#E8D5A3]"
            >
              <Eye className="h-3 w-3" />
              {bloque.titulo}
            </button>
          ))}
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={alSoltar}
      >
        {gruposOrdenados.map((grupo) =>
          grupo.visibles.length === 0 ? null : (
            <SortableContext
              key={grupo.id}
              items={grupo.visibles.map((bloque) => bloque.id)}
              strategy={rectSortingStrategy}
            >
              <div className={grupo.gridClassName}>
                {grupo.visibles.map((bloque) => (
                  <BloqueArrastrable
                    key={bloque.id}
                    bloque={bloque}
                    editando={editando}
                    onOcultar={() => alternarVisibilidad(bloque.id)}
                  />
                ))}
              </div>
            </SortableContext>
          ),
        )}
      </DndContext>

      {!hayVisibles ? (
        <p className="rounded-2xl border border-zinc-800 bg-black/40 px-5 py-10 text-center text-sm text-zinc-500">
          Ocultaste todos los bloques. Usa Personalizar para volver a mostrarlos.
        </p>
      ) : null}
    </div>
  );
}
