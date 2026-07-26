export interface ServiceExtra {
  id?: string;
  nombre: string;
  precio: number;
  activo?: boolean;
}

export interface Modelo {
  _id: string;
  nombre: string; // Mapea a nombreArtistico por compatibilidad con vistas publicas
  nombreReal: string;
  nombreArtistico: string;
  descripcion: string;
  fotoPrincipal: string;
  fotos: string[];
  linkX: string;
  contactLink: string;
  contactLabel: string;
  disponible: boolean;
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
  nombreReal: string;
  nombreArtistico: string;
  descripcion: string;
  fotoPrincipal: string;
  fotos: string[];
  linkX: string;
  contactLink: string;
  contactLabel: string;
  disponible?: boolean;
  precioBaseHora: number;
  jefeId?: string | null;
  jefeSecundarioId?: string | null;
  apartmentId?: string | null;
  extras?: ServiceExtra[];
}
