import type { CancellationReason } from "@/lib/cancellation-reasons";

export type AuthUser = {
  id: string;
  email: string;
  rol: "jefe" | "empleada" | "chofer" | "admin";
  nombre?: string | null;
  apellido?: string | null;
};

export type LoginResponse = {
  user: AuthUser;
};

export type ApiUser = AuthUser & {
  activo?: boolean;
  telegramChatId?: string | null;
  createdAt?: string;
  lastLoginAt?: string | null;
};

export type EmployeePhoto = {
  id: string;
  empleadaId: string;
  url: string;
  orden: number;
  createdAt?: string;
};

export type EmployeePrivatePhoto = {
  id: string;
  empleadaId: string;
  url: string;
  orden: number;
  createdAt?: string;
};

export type WeeklyPhotoSubmission = {
  id: string;
  empleadaId: string;
  url: string;
  estado: "pendiente" | "aprobada_publica" | "aprobada_privada" | "rechazada";
  semanaInicio: string | null;
  revisadoPorUserId?: string | null;
  revisadoAt?: string | null;
  createdAt: string;
};

export type Employee = {
  id: string;
  usuarioId: string;
  jefeId?: string | null;
  jefeSecundarioId?: string | null;
  nombreReal: string;
  nombreArtistico: string;
  slugCatalogo: string;
  fotoPerfilUrl: string | null;
  descripcion: string | null;
  precioBaseHora: string;
  disponible: boolean;
  catalogoActivo: boolean;
  availabilityStatus?: "disponible" | "ocupada" | "inactiva";
  estimatedAvailableAt?: string | null;
  canScheduleNext?: boolean;
  totalServiciosValorados: number;
  promedioCalificacion: number | null;
  clientRatingAverage?: number | null;
  clientRatingCount?: number;
  ubicacionLat: string | null;
  ubicacionLng: string | null;
  ultimaUbicacionAt?: string | null;
  createdAt?: string;
  empleadaFotos?: EmployeePhoto[];
  fotosExclusivas?: EmployeePrivatePhoto[];
  pendingWeeklyPhotosCount?: number;
  weeklyContentStatus?: "al_dia" | "atrasado" | "pendiente_revision";
  usuario?: ApiUser;
};

export type Driver = {
  id: string;
  usuarioId: string;
  nombre: string;
  telefono: string;
  disponible: boolean;
  ubicacionLat: string | null;
  ubicacionLng: string | null;
  ultimaUbicacionAt?: string | null;
  createdAt?: string;
  usuario?: ApiUser;
};

export type Client = {
  id: string;
  telegramChatId: string;
  nombreTelegram: string | null;
  telefono?: string | null;
  createdAt?: string;
  primerContactoAt?: string;
};

export type ServiceStatus =
  | "pendiente"
  | "agendado"
  | "en_curso"
  | "finalizado"
  | "cancelado";

export type Service = {
  id: string;
  serviceType?: "individual" | "grupal";
  empleadaId: string;
  clienteId: string;
  jefeId: string;
  metodoPago: "efectivo" | "tarjeta" | "transferencia" | "mixto";
  duracionPactadaHoras: string;
  duracionFinalHoras: string | null;
  ubicacionClienteLat: string;
  ubicacionClienteLng: string;
  precioBaseHoraPactado: string;
  totalBase: string;
  totalExtras: string;
  totalFinal: string;
  totalPaid?: number;
  pendingBalance?: number;
  transportFeeSnapshot?: number;
  manualTransportAdjustment?: number;
  pendingDurationHours?: number | null;
  totalTransporte?: string;
  customerTransportCharge?: number | null;
  actualTransportCost?: number;
  presetLocationId?: string | null;
  locationNameSnapshot?: string | null;
  locationAddressSnapshot?: string | null;
  horaInicioServicio: string | null;
  horaFinServicio: string | null;
  horaLlegadaCasa: string | null;
  prorrogasUsadas: number;
  estado: ServiceStatus;
  motivoCancelacion?: CancellationReason | null;
  notaCancelacion?: string | null;
  canceladoPorUserId?: string | null;
  canceladoAt?: string | null;
  notas: string | null;
  notasJefe?: string | null;
  iaActiva: boolean;
  calificacion: number | null;
  comentariosCalificacion: string | null;
  servicioPrevioId: string | null;
  horaDisponibilidadEstimada?: string | null;
  horaInicioEstimada: string | null;
  fechaProgramada?: string | null;
  tipoAgenda?: "inmediato" | "programado";
  notificacionPreviaEnviada?: boolean;
  transporteAgendado?: "chofer" | "uber" | null;
  createdAt: string;
  calculationStatus: "provisional" | "ready" | "paid";
  pendingReason: string | null;
  customerTotal: number;
  uberDeduction: number;
  updatedAt: string;
  estadoLiquidacion?: "transporte_pendiente" | "cerrada";
  viajes?: Trip[];
  participantes?: ServiceParticipant[];
  pagos?: ServicePayment[];
  receiptValidations?: PaymentReceiptValidation[];
  cliente?: Client;
  empleada?: Employee;
};

export type TripZone = "montecarlo" | "majestic" | "domicilio";

export type Trip = {
  id: string;
  servicioId: string;
  unitNumber?: number;
  choferId: string | null;
  tipo: "ida" | "regreso";
  estado: "notificado" | "aceptado" | "en_camino" | "llegado" | "en_curso" | "finalizado" | "rechazado" | "cancelado";
  proveedorTransporte: "interno" | "uber";
  zona?: TripZone;
  tarifa: string | number;
  telegramUberFileId?: string | null;
  uberScreenshotUrl?: string | null;
  uberScreenshotUploadedAt?: string | null;
  driverPayout?: number;
  fareConfirmedAt?: string | null;
  /** Se cancelo ya despachado: su costo real sigue pendiente de cerrar. */
  canceladoConCosto?: boolean;
  /** El costo de ese viaje cancelado se le cobro al cliente. */
  costoCobradoAlCliente?: boolean;
  fareConfirmationOverride?: boolean;
  driverSettlementId?: string | null;
  /**
   * Ciclo de la oferta al chofer. El backend ya los guarda en viajes y son lo
   * que permite medir cuanto tarda en aceptarse un viaje y cuantas ofertas
   * vencieron sin respuesta.
   */
  ofertaExpiraEn?: string | null;
  horaNotificacion?: string;
  horaAceptacion?: string | null;
  horaFinViaje?: string | null;
  passengers?: TripPassenger[];
};

export type ServiceParticipant = {
  id: string;
  serviceId: string;
  employeeId: string;
  role: "responsable" | "participante";
  status: "reservada" | "pendiente_pago" | "activa" | "retirada" | "cancelada";
  hourlyRateSnapshot: number;
  billableHours: number;
  confirmedSubtotal: number;
  holdExpiresAt: string | null;
  joinedAt: string | null;
  removedAt: string | null;
  employee?: Employee;
};

export type ServicePayment = {
  id: string;
  serviceId: string;
  amount: number;
  status: "pendiente" | "aprobado" | "rechazado";
  fingerprint: string | null;
  notes: string | null;
  createdAt: string;
  receiptValidation?: PaymentReceiptValidation | null;
};

export type PaymentReceiptValidation = {
  id: string;
  servicioId?: string | null;
  imageUrl?: string | null;
  telegramFileId?: string | null;
  estado?: string | null;
  monto?: number | null;
  observaciones?: string | null;
  clienteTelegram?: string | null;
  createdAt: string;
};

export type EvidenceItem = {
  id: string;
  kind: "uber" | "transferencia";
  url: string;
  status: string;
  createdAt: string;
  serviceId: string | null;
  tripId?: string;
  tripType?: "ida" | "regreso";
  clientName?: string | null;
  amount?: number | null;
  observations?: string | null;
};

export type EvidencePage = {
  items: EvidenceItem[];
  nextCursor: string | null;
};

export type TripPassenger = {
  id: string;
  tripId: string;
  employeeId: string;
  employee?: Employee;
};

export type GroupRequestSelection = {
  id: string;
  requestId: string;
  employeeId: string;
  status: "seleccionada" | "reservada" | "liberada" | "confirmada";
  selectedBy: "cliente" | "jefe";
  hourlyRateSnapshot: number;
  expiresAt: string;
  employee?: Employee;
};

export type GroupServiceRequest = {
  id: string;
  clientId: string;
  bossId: string;
  initialEmployeeId: string | null;
  serviceId: string | null;
  status:
    | "esperando_jefe"
    | "seleccionando"
    | "reservada"
    | "esperando_pago"
    | "confirmada"
    | "vencida"
    | "cancelada";
  durationHours: number | null;
  paymentMethod: "efectivo" | "tarjeta" | "transferencia" | "mixto" | null;
  locationLat: number | null;
  locationLng: number | null;
  locationReference: string | null;
  catalogVersion: number;
  holdExpiresAt: string | null;
  telegramThreadId: string | null;
  createdAt: string;
  updatedAt: string;
  client?: Client;
  boss?: ApiUser;
  initialEmployee?: Employee;
  selections: GroupRequestSelection[];
  service?: Service | null;
};

export type ConversationMessage = {
  id: string;
  clienteId: string;
  servicioId: string | null;
  groupRequestId?: string | null;
  bookingSessionId?: string | null;
  emisor: "ia" | "jefe" | "cliente" | "sistema";
  mensaje: string;
  enviadoAt: string;
};

export type CashObligation = {
  id: string;
  serviceId: string;
  employeeId: string;
  amount: number;
  paidAmount: number;
  status: "pending" | "paid";
  calculationStatus: "provisional" | "ready" | "paid";
  pendingReason: string | null;
  customerTotal: number;
  uberDeduction: number;
  createdAt: string;
};

export type CashObligationSummary = {
  obligations: CashObligation[];
  employees: Array<{ id: string; name: string }>;
  total: number;
};

export type EmployeeReportCategory =
  | "trato_inadecuado"
  | "demora_impuntualidad"
  | "incumplimiento"
  | "cobro"
  | "seguridad"
  | "otro";

export type EmployeeReportOrigin = "cliente" | "chofer";
export type EmployeeReportPriority = "normal" | "alta" | "urgente";
export type EmployeeReportStatus =
  | "nuevo"
  | "en_revision"
  | "resuelto"
  | "descartado";

export type ServiceExtension = {
  id: string;
  servicioId: string;
  numeroProrroga: number;
  minutosSolicitados: number;
  solicitadaAt: string;
  aprobada: boolean;
};

export type EmployeeReportHistory = {
  id: string;
  reportId: string;
  actorUserId: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  note: string | null;
  createdAt: string;
  actor?: ApiUser | null;
};

export type EmployeeReport = {
  id: string;
  serviceId: string;
  employeeId: string;
  bossId: string;
  origin: EmployeeReportOrigin;
  clientId: string | null;
  driverId: string | null;
  category: EmployeeReportCategory;
  description: string;
  priority: EmployeeReportPriority;
  status: EmployeeReportStatus;
  assignedAdminId: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: Employee;
  client?: Client | null;
  driver?: Driver | null;
  assignedAdmin?: ApiUser | null;
  service?: Service & { prorrogases?: ServiceExtension[] };
  history?: EmployeeReportHistory[];
};

export type EmployeeReportsPage = {
  items: EmployeeReport[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export type EmployeeReportSummary = {
  newCases: number;
  urgentCases: number;
  employeesOverTolerance: number;
};

export type EmployeeTolerance = {
  employeeId: string;
  employeeName: string;
  reports90Days: number;
  reportsHistorical: number;
  extensions30Days: number;
  extensionsHistorical: number;
  reportsOverTolerance: boolean;
  extensionsOverTolerance: boolean;
  reportTolerance: number;
  extensionTolerance: number;
};

export type DriverPortalTripItem = {
  id: string;
  fecha: string;
  tipo: "ida" | "regreso";
  zona: string;
  proveedorTransporte: string;
  driverPayout: number;
};

export type DriverPortalActiveTrip = {
  id: string;
  tipo: "ida" | "regreso";
  estado: string;
  zona: string;
  proveedorTransporte: string;
};

export type DriverPortalData = {
  profile: {
    id: string;
    nombre: string;
    telefono: string;
    disponible: boolean;
    availabilityStatus: "disponible" | "inactiva";
    vehiculo: {
      marca: string | null;
      modelo: string | null;
      color: string | null;
      placa: string | null;
    };
  };
  ranking: {
    myPosition: number;
    totalDrivers: number;
    leaderboard: Array<{ position: number; nombre: string; isMe: boolean }>;
  };
  earnings: {
    todayNet: number;
    weekNet: number;
    monthNet: number;
    totalHistoricalNet: number;
    todayTrips: number;
    weekTrips: number;
    monthTrips: number;
    totalHistoricalTrips: number;
    weeklySettlementStatus: "preview" | "pending" | "paid";
  };
  activeTrip: DriverPortalActiveTrip | null;
  recentTrips: DriverPortalTripItem[];
  reputation: {
    ratingAverage: number;
    ratingCount: number;
    kpiScore: number;
    confirmedReports90Days: number;
    reviews: Array<{
      id: string;
      fecha: string;
      estrellas: number;
      comentario: string;
    }>;
  };
};

export type ScreeningQuestionOption = {
  id?: string;
  text: string;
  isCorrect?: boolean;
};

export type ScreeningQuestion = {
  id: string;
  text: string;
  active: boolean;
  order: number;
  options?: ScreeningQuestionOption[];
  createdAt: string;
};

export type CandidateScreeningStatus = "pendiente" | "en_progreso" | "completado";

export type CandidateScreeningAnswer = {
  id: string;
  questionId: string;
  questionText: string;
  answerText: string;
  selectedOptionText?: string;
  answeredAt: string;
};

export type CandidateScreening = {
  id: string;
  candidateName: string;
  candidatePhone: string | null;
  token: string;
  telegramChatId: string | null;
  status: CandidateScreeningStatus;
  questionIds: string[];
  createdByUserId: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  promotedEmployeeId: string | null;
  createdBy?: { id: string; email: string };
  promotedEmployee?: { id: string; nombreArtistico: string } | null;
  answers?: CandidateScreeningAnswer[];
};

export type EmployeeKpi = {
  id: string;
  nombreArtistico: string;
  fotoPerfilUrl: string | null;
  promedioCalificacion: number | null;
  totalServiciosValorados: number;
  confirmedReports90Days: number;
  revenue90Days?: number;
  disponible?: boolean;
  score: number | null;
  position: number | null;
};

export type DriverKpi = {
  id: string;
  nombre: string;
  fotoPerfilUrl: null;
  ratingAverage: number | null;
  confirmedReports90Days: number;
  revenue90Days?: number;
  disponible?: boolean;
  score: number | null;
  position: number | null;
};

export type EmployeeRatingComment = {
  stars: number;
  comment: string;
  createdAt: string;
};

export type EmployeeReportFilters = {
  page?: number;
  limit?: number;
  status?: EmployeeReportStatus;
  priority?: EmployeeReportPriority;
  category?: EmployeeReportCategory;
  origin?: EmployeeReportOrigin;
  employeeId?: string;
  bossId?: string;
  from?: string;
  to?: string;
};

export type EmployeeRankingEntry = {
  position: number;
  nombreArtistico: string;
  isMe: boolean;
};

export type EmployeePortalRanking = {
  myPosition: number;
  totalModels: number;
  leaderboard: EmployeeRankingEntry[];
};

export type EmployeePortalEarnings = {
  todayNet: number;
  weekNet: number;
  monthNet: number;
  totalHistoricalNet: number;
  todayHours: number;
  weekHours: number;
  monthHours: number;
  totalHistoricalHours: number;
  percentageRate: number;
};

export type EmployeePortalServiceItem = {
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
};

export type EmployeePortalActiveService = {
  id: string;
  estado: string;
  duracionHoras: number;
  metodoPago: string;
  horaInicio?: string | null;
  horaFinEstimada?: string | null;
  gananciaEstimada: number;
  transporte?: {
    tipo: string;
    proveedor: string;
    estado: string;
    choferNombre?: string;
  } | null;
};

export type EmployeePortalReputation = {
  ratingAverage: number;
  ratingCount: number;
  trustScore: number;
  reviews: {
    id: string;
    fecha: string;
    estrellas: number;
    comentario: string;
  }[];
};

export type EmployeePortalCashObligationItem = {
  id: string;
  serviceId: string;
  amount: number;
  paidAmount: number;
  pendingAmount: number;
  calculationStatus: "provisional" | "ready" | "paid";
  pendingReason: string | null;
  customerTotal: number;
  uberDeduction: number;
  serviceDate: string;
  createdAt: string;
};

export type EmployeePortalCashDelivery = {
  totalPending: number;
  pendingServicesCount: number;
  hasProvisional: boolean;
  obligations: EmployeePortalCashObligationItem[];
};

export type EmployeePortalData = {
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
    publicPhotosCount: number;
    privatePhotosCount: number;
    publicPhotos: string[];
    privatePhotos: string[];
  };
  ranking: EmployeePortalRanking;
  earnings: EmployeePortalEarnings;
  cashDelivery?: EmployeePortalCashDelivery;
  activeService: EmployeePortalActiveService | null;
  recentServices: EmployeePortalServiceItem[];
  reputation: EmployeePortalReputation;
};

export type ChallengeParticipantType = "employee" | "driver";
export type ChallengeMetric = "kpi_score" | "services" | "revenue";
export type ChallengeStatus = "scheduled" | "active" | "finished" | "cancelled";

export type ChallengeSummary = {
  id: string;
  title: string;
  participantType: ChallengeParticipantType;
  metric: ChallengeMetric;
  status: ChallengeStatus;
  startsAt: string;
  endsAt: string;
  createdByUserId: string;
  winnerParticipantId: string | null;
  winnerValue: string | null;
  participantsCount: number;
  createdAt: string;
};

export type ChallengeStanding = {
  participantId: string;
  name: string;
  value: number;
  position: number;
};

export type ChallengeDetail = ChallengeSummary & {
  standings: ChallengeStanding[];
};

export type DriverShift = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  daysOfWeek: number[];
  capacity: number | null;
  active: boolean;
  createdByUserId: string;
  createdAt: string;
};

export type DriverShiftSummary = DriverShift & { assignedCount: number };

export type DriverShiftPerson = {
  id: string;
  nombre: string;
  score: number;
  /**
   * Estado de despacho del chofer ahora mismo. Es informativo: no decide quien
   * puede tomar un turno, porque asignar turnos es planear la semana.
   */
  disponible?: boolean;
};

export type DriverShiftDetail = DriverShift & {
  assignedDrivers: DriverShiftPerson[];
};

/** Turnos de un chofer concreto: los que tiene y los que puede tomar. */
export type DriverShiftsForDriver = {
  driverId: string;
  assigned: DriverShiftSummary[];
  available: DriverShiftSummary[];
};

export type DriverShiftCandidates = {
  shiftId: string;
  capacity: number | null;
  assignedCount: number;
  candidates: DriverShiftPerson[];
};

export type PresetServiceLocation = {
  id: string;
  name: string;
  address?: string | null;
  latitude: number | string;
  longitude: number | string;
  active: boolean;
  sortOrder?: number;
};

export type CreateManualServiceInput = {
  clienteId: string;
  empleadaId: string;
  duracionPactadaHoras: number;
  metodoPago: "efectivo" | "tarjeta" | "transferencia";
  ubicacionClienteLat: number;
  ubicacionClienteLng: number;
  precioBaseHoraPactado: number;
  notas?: string;
  fechaProgramada?: string;
  tipoAgenda?: "inmediato" | "programado";
  presetLocationId?: string;
  clienteTelegramId?: string;
};


/**
 * Nombres de las personas del sistema, indexados por tipo e id.
 *
 * Los reportes de conducta y las sanciones guardan a quien senalan como un par
 * de tipo e id, sin nombre, asi que el panel disciplinario necesita esta
 * traduccion para no mostrar UUIDs.
 */
export type Directorio = Record<
  "client" | "employee" | "driver" | "boss",
  Record<string, string>
>;

/** Reglamento vigente de un rol, tal como lo publica el panel. */
export type Regulation = {
  id: string;
  targetRole: "empleada" | "chofer" | "jefe";
  title: string;
  content: string;
  passingScore: number;
  publicationKey: string;
  publishedAt: string;
  updatedAt?: string;
  /** El endpoint de admin devuelve el cuestionario junto al reglamento. */
  questions?: Array<{ id: string; text: string }>;
};

/**
 * Estado del reglamento de una persona del staff.
 *
 * `onboarding` es null mientras no se le haya asignado ninguno; cuando existe,
 * `status` avanza de pending a completed y `bestScore` guarda el mejor intento.
 */
export type StaffOnboarding = ApiUser & {
  onboarding: {
    id: string;
    userId: string;
    employeeId: string | null;
    status: "pending" | "in_progress" | "completed";
    active: boolean;
    isRenewal: boolean;
    attemptCount: number;
    bestScore: number;
    trustScore: number;
    assignedAt: string;
    regulationSentAt: string | null;
    readAt: string | null;
    completedAt: string | null;
    lastDeliveryError: string | null;
  } | null;
};
