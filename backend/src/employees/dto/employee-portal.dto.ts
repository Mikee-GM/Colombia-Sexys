export interface EmployeeRankingEntry {
  position: number;
  nombreArtistico: string;
  isMe: boolean;
}

export interface EmployeePortalRanking {
  myPosition: number;
  totalModels: number;
  leaderboard: EmployeeRankingEntry[];
}

export interface EmployeePortalEarnings {
  todayNet: number;
  weekNet: number;
  monthNet: number;
  totalHistoricalNet: number;
  todayHours: number;
  weekHours: number;
  monthHours: number;
  totalHistoricalHours: number;
  percentageRate: number; // e.g. 60
}

export interface EmployeePortalServiceItem {
  id: string;
  fecha: string;
  duracionHoras: number;
  metodoPago: string;
  estado: string;
  extrasTotal: number;
  gananciaNeta: number;
  calificacion?: number | null;
  comentarioCliente?: string | null;
  transporteTipo?: string | null;
  transporteEstado?: string | null;
}

export interface EmployeePortalActiveService {
  id: string;
  estado: string;
  duracionHoras: number;
  metodoPago: string;
  horaInicio?: string | null;
  horaFinEstimada?: string | null;
  gananciaEstimada: number;
  /** Prorrogas de espera ya gastadas, de un maximo de tres. */
  prorrogasUsadas?: number;
  transporte?: {
    /** Id del viaje: es lo que el portal necesita para marcar el avance. */
    id: string;
    tipo: string;
    proveedor: string;
    estado: string;
    choferNombre?: string;
    /** Captura del Uber, cuando el jefe ya la subio. */
    uberScreenshotUrl?: string;
  } | null;
}

export interface EmployeePortalReputation {
  ratingAverage: number;
  ratingCount: number;
  trustScore: number;
  reviews: {
    id: string;
    fecha: string;
    estrellas: number;
    comentario: string;
  }[];
}

export interface EmployeePortalCashObligationItem {
  id: string;
  serviceId: string;
  amount: number;
  paidAmount: number;
  pendingAmount: number;
  calculationStatus: 'provisional' | 'ready' | 'paid';
  pendingReason: string | null;
  customerTotal: number;
  uberDeduction: number;
  serviceDate: string;
  createdAt: string;
}

export interface EmployeePortalCashDelivery {
  totalPending: number;
  pendingServicesCount: number;
  hasProvisional: boolean;
  obligations: EmployeePortalCashObligationItem[];
}

/**
 * Estado del ciclo de fotos de la semana tal y como lo ve la modelo.
 *
 * `weeklyContentStatus` se queda en la etiqueta; esto es lo que permite al
 * portal decirle cuantos avisos lleva, cuantos le quedan y cuanto le costaria
 * dejar pasar el ultimo.
 */
export interface EmployeePortalWeeklyContent {
  semanaInicio: string;
  estado: 'al_dia' | 'atrasado' | 'pendiente_revision' | 'sin_solicitar';
  recordatoriosEnviados: number;
  maxRecordatorios: number;
  recordatoriosRestantes: number;
  entregoEstaSemana: boolean;
  fotosPendientesDeRevision: number;
  multaAplicadaAt: string | null;
  importeMulta: number;
}

export interface EmployeePortalData {
  profile: {
    id: string;
    nombreArtistico: string;
    fotoPerfilUrl: string | null;
    precioBaseHora: number;
    disponible: boolean;
    catalogoActivo: boolean;
    availabilityStatus: string;
    weeklyContentStatus: string;
    pendingWeeklyPhotosCount: number;
    weeklyContent: EmployeePortalWeeklyContent;
    publicPhotosCount: number;
    privatePhotosCount: number;
    publicPhotos: string[];
    privatePhotos: string[];
  };
  ranking: EmployeePortalRanking;
  earnings: EmployeePortalEarnings;
  cashDelivery: EmployeePortalCashDelivery;
  activeService: EmployeePortalActiveService | null;
  recentServices: EmployeePortalServiceItem[];
  reputation: EmployeePortalReputation;
}
