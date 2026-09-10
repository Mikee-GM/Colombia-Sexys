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
import {
  Check,
  Eye,
  EyeOff,
  GripVertical,
  LayoutGrid,
  RotateCcw,
} from "lucide-react";

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
  /**
   * Encabezado de la zona. Se omite en los grupos que continuan la zona
   * anterior: una zona puede repartirse en dos grupos --indicadores y
   * paneles-- porque son rejillas distintas, pero lleva un solo titulo.
   */
  titulo?: string;
  descripcion?: string;
  /**
   * En que pestaña vive el grupo. Sin valor va a la primera: un tablero de una
   * sola pestaña no tiene que declararla en cada grupo.
   */
  pestana?: string;
};

/**
 * Una pestaña del tablero.
 *
 * El centro de mando se partio en dos porque el analisis a fondo quedaba al
 * final de una pagina muy larga: para llegar habia que bajar pasando por todo
 * lo demas, y con el tablero personalizado ni siquiera se sabia por donde
 * andaba. Cada pestaña es una intencion distinta --operar hoy, o investigar--
 * y no dos partes de la misma lectura.
 */
export type PestanaTablero = {
  id: string;
  titulo: string;
  /** Se pinta bajo la barra, solo en las pestañas que necesitan explicarse. */
  descripcion?: string;
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bloque.id, disabled: !editando });

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

/**
 * Encabezado de una zona del tablero.
 *
 * Las zonas son la respuesta al problema de fondo del centro de mando: veinte
 * bloques con el mismo peso visual y sin ninguna jerarquia entre ellos. El
 * titulo dice a que pregunta responde lo que viene debajo.
 */
function EncabezadoDeZona({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-zinc-800/70 pt-5">
      <div className="min-w-0 text-left">
        <h2 className="font-heading text-[15px] font-semibold tracking-[0.05em] text-zinc-200">
          {titulo}
        </h2>
        {descripcion ? (
          <p className="mt-0.5 text-[11px] text-zinc-500">{descripcion}</p>
        ) : null}
      </div>
    </div>
  );
}

export default function TableroPersonalizable({
  grupos,
  pestanas = [],
  layoutInicial,
}: {
  grupos: GrupoTablero[];
  /** Vacio para un tablero de una sola pestaña: entonces no se pinta la barra. */
  pestanas?: PestanaTablero[];
  /** Nulo si el administrador nunca lo toco: se usa el orden por defecto. */
  layoutInicial: DashboardLayout | null;
}) {
  const bloques = useMemo(
    () => grupos.flatMap((grupo) => grupo.bloques),
    [grupos],
  );

  const [editando, setEditando] = useState(false);

  /*
   * La pestaña abierta. No se guarda: al entrar al panel siempre interesa lo
   * primero --lo que pide accion hoy-- y no donde se quedo la ultima vez.
   */
  const [pestanaActiva, setPestanaActiva] = useState(pestanas[0]?.id ?? "");
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

  /*
   * Los grupos de la pestaña abierta. Un grupo sin pestaña declarada vive en la
   * primera, para que un tablero de una sola pestaña no tenga que repetirla.
   */
  const gruposVisibles = useMemo(
    () =>
      gruposOrdenados.filter(
        (grupo) =>
          pestanas.length === 0 ||
          (grupo.pestana ?? pestanas[0]?.id) === pestanaActiva,
      ),
    [gruposOrdenados, pestanas, pestanaActiva],
  );

  /*
   * La lista de ocultos es la de la pestaña abierta y no la del tablero entero:
   * volver a mostrar desde aqui un bloque que vive en la otra pestaña lo haria
   * reaparecer donde no se esta mirando.
   */
  const ocultos = useMemo(
    () => gruposVisibles.flatMap((grupo) => grupo.ocultos),
    [gruposVisibles],
  );
  const hayVisibles = gruposVisibles.some((grupo) => grupo.visibles.length > 0);
  const descripcionDePestana = pestanas.find(
    (pestana) => pestana.id === pestanaActiva,
  )?.descripcion;

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {pestanas.length > 1 ? (
          <div role="tablist" className="flex flex-wrap items-center gap-2">
            {pestanas.map((pestana) => {
              const activa = pestana.id === pestanaActiva;
              return (
                <button
                  key={pestana.id}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  onClick={() => setPestanaActiva(pestana.id)}
                  className={`rounded-xl border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.05em] transition-colors ${
                    activa
                      ? "border-[#C5A55A] bg-[#C5A55A]/10 text-[#E8D5A3]"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white"
                  }`}
                >
                  {pestana.titulo}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {error ? (
            <span className="text-[11px] text-red-400">{error}</span>
          ) : guardando ? (
            <span className="text-[11px] text-zinc-500">Guardando</span>
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
      </div>

      {descripcionDePestana ? (
        <p className="-mt-3 text-[12px] text-zinc-500">
          {descripcionDePestana}
        </p>
      ) : null}

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
        {gruposVisibles.map((grupo) => {
          if (grupo.visibles.length === 0) return null;

          return (
            <div key={grupo.id} className="flex flex-col gap-3">
              {grupo.titulo ? (
                <EncabezadoDeZona
                  titulo={grupo.titulo}
                  descripcion={grupo.descripcion}
                />
              ) : null}

              <SortableContext
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
            </div>
          );
        })}
      </DndContext>

      {!hayVisibles ? (
        <p className="rounded-2xl border border-zinc-800 bg-black/40 px-5 py-10 text-center text-sm text-zinc-500">
          Ocultaste todos los bloques de esta pestaña. Usa Personalizar para
          volver a mostrarlos.
        </p>
      ) : null}
    </div>
  );
}
