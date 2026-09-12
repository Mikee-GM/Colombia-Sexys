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
  /** Notas que dejo el jefe al autorizar. Es lo que tiene que leer antes de salir. */
  notasJefe?: string | null;
  /** Habitacion, cuando el cliente la dio. */
  habitacion?: string | null;
  /** A donde va: nombre del sitio, si se reservo sobre una ubicacion conocida. */
  destino?: string | null;
  /** Direccion del destino, para poder abrirla en el mapa. */
  destinoDireccion?: string | null;
  /**
   * Se esta esperando a que avise que esta lista, y hasta entonces no hay Uber.
   *
   * Solo pasa con Uber en el viaje de ida: es el paso que separa autorizar de
   * pedir el coche, para que no llegue mientras ella se arregla.
   */
  esperandoAlistado?: boolean;
  /** Cuando aviso que estaba lista, si ya lo hizo. */
  empleadaListaAt?: string | null;
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
  /**
   * Mensajes de coordinacion que todavia no ha abierto.
   *
   * Viaja con el resto del portal y no por una peticion aparte porque es un
   * numero que hay que pintar en cuanto entra --el aviso del boton-- y pedirlo
   * por separado dejaria el boton sin marca durante el primer instante.
   */
  canalSinLeer: number;
}
