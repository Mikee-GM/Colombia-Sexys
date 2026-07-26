import ServiceStatusBadge from "./service-status-badge";
import type { Service } from "@/lib/types";
import { formatAvailabilityTime } from "@/lib/availability";

type Props = {
  initialServices?: Service[];
};

export default function ServicesTable({ initialServices = [] }: Props) {
  return (
    <div
      className="
      rounded-3xl
      border
      border-zinc-800
      bg-zinc-950
      overflow-hidden
      "
    >
      <table className="w-full">
        <thead>
          <tr
            className="
            border-b
            border-zinc-800
            text-left
            "
          >
            <th className="p-4">ID</th>
            <th className="p-4">Cliente</th>
            <th className="p-4">Duración</th>
            <th className="p-4">Empleada</th>
            <th className="p-4">Total</th>
            <th className="p-4">Estado</th>
          </tr>
        </thead>

        <tbody>
          {initialServices.length === 0 ? (
            <tr>
              <td colSpan={6} className="p-8 text-center text-zinc-500">
                No hay servicios registrados.
              </td>
            </tr>
          ) : (
            initialServices.map((service) => (
              <tr
                key={service.id}
                className="
                border-b
                border-zinc-900
                hover:bg-zinc-900/50
                "
              >
                <td className="p-4 text-xs font-mono">{service.id.slice(-6).toUpperCase()}</td>

                <td className="p-4">
                  {service.cliente?.nombreTelegram || "Cliente"}
                </td>

                <td className="p-4">
                  {service.duracionPactadaHoras}h
                </td>

                <td className="p-4">
                  {service.empleada?.nombreArtistico || "No asignada"}
                </td>

                <td className="p-4">
                  ${parseFloat(service.totalFinal || "0").toLocaleString()}
                </td>

                <td className="p-4">
                  <ServiceStatusBadge
                    status={service.estado}
                  />
                  {service.horaInicioEstimada && (
                    <p className="mt-2 text-xs text-zinc-500">
                      Llegada estimada:{" "}
                      {formatAvailabilityTime(service.horaInicioEstimada)}
                    </p>
                  )}
                  {service.notasJefe && (
                    <p className="mt-2 max-w-xs text-xs text-zinc-400">
                      Nota interna: {service.notasJefe}
                    </p>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
