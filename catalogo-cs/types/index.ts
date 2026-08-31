export interface ServiceExtra {
  id?: string;
  nombre: string;
  precio: number;
  activo?: boolean;
  modelosVinculadasIds?: string[];
  /**
   * Texto exacto que la modelo enviara al cliente cuando pregunte por este
   * extra. Se usa principalmente en "Atencion a parejas".
   */
  speechPersonalizado?: string;
}

/**
 * Politica de besos declarada en la ficha. `null` significa "sin declarar": el
 * bot vuelve entonces a deducirla del texto de la descripcion, que es como
 * funcionaba antes de que existiera este campo.
 */
export type PoliticaBesos = "no_besa" | "besos" | "besos_bien_dados";

export interface Modelo {
  _id: string;
  nombre: string; // Mapea a nombreArtistico por compatibilidad con vistas publicas
  nombreReal: string;
  nombreArtistico: string;
  descripcion: string;
  /** Sello propio de habla, se inyecta en el prompt de la IA. */
  estiloHabla?: string;
  politicaBesos?: PoliticaBesos | null;
  fotoPrincipal: string;
  fotos: string[];
  fotosExclusivas?: string[];
  pendingWeeklyPhotosCount?: number;
  weeklyContentStatus?: "al_dia" | "atrasado" | "pendiente_revision";
  linkX: string;
  contactLink: string;
  contactLabel: string;
  disponible: boolean;
  catalogoActivo?: boolean;
  sancionada?: boolean;
  availabilityStatus?: "disponible" | "ocupada" | "inactiva";
  estimatedAvailableAt?: string | null;
  canScheduleNext?: boolean;
  precioBaseHora: number;
  jefeId?: string | null;
  jefeSecundarioId?: string | null;
  apartmentId?: string | null;
  usuarioId?: string | null;
  trustScore?: number | null;
  clientRatingAverage?: number | null;
  clientRatingCount?: number;
  createdAt?: string;
  updatedAt?: string;
  extras?: ServiceExtra[];
}

export interface ModeloPayload {
  /** Credenciales con las que entra a su portal desde la app web. */
  email: string;
  /** Solo al crear, o al cambiarla desde la edicion. Vacio deja la que tiene. */
  password?: string;
  nombreReal: string;
  nombreArtistico: string;
  descripcion: string;
  /** Sello propio de habla, se inyecta en el prompt de la IA. */
  estiloHabla?: string;
  politicaBesos?: PoliticaBesos | null;
  fotoPrincipal: string;
  fotos: string[];
  linkX: string;
  contactLink: string;
  contactLabel: string;
  disponible?: boolean;
  catalogoActivo?: boolean;
  precioBaseHora: number;
  jefeId?: string | null;
  jefeSecundarioId?: string | null;
  apartmentId?: string | null;
  extras?: ServiceExtra[];
}
