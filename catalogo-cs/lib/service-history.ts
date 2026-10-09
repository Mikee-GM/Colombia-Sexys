export type WeeklyHistoryFinancials = {
  serviceBaseAmount: number;
  extensionsAmount: number;
  serviceCommissionableBase: number;
  employeeServiceExpected: number;
  cardExtrasTotal: number;
  cardExtraCompanyCommission: number;
  cardExtrasEmployeeNet: number;
  customerTransportCharge: number;
  employeeExpectedTotal: number;
};

export type WeeklyHistoryRow = {
  id: string;
  folio: string;
  date: string;
  durationHours: number;
  employeeId: string;
  employeeName: string;
  bossId: string | null;
  bossName: string | null;
  paymentMethod: string;
  place: string;
  startAt: string | null;
  status: string;
  rating: number | null;
  observations: string | null;
  snapshotStatus: string;
  hasLegacyExtraSnapshots: boolean;
  financials: WeeklyHistoryFinancials;
};

export type WeeklyHistorySummary = {
  services: number;
  hours: number;
  serviceBase: number;
  extensions: number;
  commissionableBase: number;
  employeeServiceExpected: number;
  cardExtras: number;
  cardExtraCompanyCommission: number;
  cardExtrasEmployeeNet: number;
  customerTransport: number;
  employeeExpectedTotal: number;
  cashService: number;
  cardService: number;
  transferService: number;
  mixedService: number;
  cancelled: number;
  averageRating: number | null;
};

export type WeeklyHistoryData = {
  week: {
    startDate: string;
    endDate: string;
    previousStart: string;
    nextStart: string;
    canGoNext: boolean;
  };
  selectedEmployeeId: string | null;
  employees: Array<{
    id: string;
    name: string;
    bossId: string | null;
    bossName: string | null;
  }>;
  rows: WeeklyHistoryRow[];
  summary: WeeklyHistorySummary;
};

export type ServiceTrashItem = {
  id: string;
  folio: string;
  employeeName: string;
  clientName: string;
  serviceDate: string;
  previousStatus: string | null;
  previousOperationalState: string | null;
  deletedAt: string | null;
  deletedByUserId: string | null;
  deleteReason: string | null;
  actorRole: string | null;
};
