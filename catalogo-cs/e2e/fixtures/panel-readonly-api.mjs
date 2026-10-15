/* Datos ficticios para verificar presentación. No usa DB ni servicios externos. */
import http from 'node:http';

const employees = Array.from({ length: 18 }, (_, index) => ({
  id: `fixture-person-${index + 1}`,
  jefeId: 'fixture-jefe',
  nombreArtistico: `Persona QA ${String(index + 1).padStart(2, '0')}`,
  nombreReal: `Persona QA ${index + 1}`,
  disponible: true,
  activo: true,
  ubicacionLat: String(20.58 + index * 0.001),
  ubicacionLng: String(-100.38 + index * 0.001),
}));

const record = (id, sourceRole, serviceTotal) => ({
  id, sourceRole, serviceTotal,
  serviceId: 'fixture-historical-record', employeeId: employees[0].id,
  occurredAt: new Date().toISOString(), paymentMethod: 'efectivo',
  cashAmount: serviceTotal, cardAmounts: [], companyPercentage: 50,
  extraAmount: 0, promotion: false, membershipAmount: 0,
  companyTransportExpense: 0, customerTransportCharge: 0,
  employeeUberReimbursement: 0, employeeCashDue: serviceTotal,
  electronicExtraAmount: 0, cardExtraAmount: 0, transportExcess: 0,
  place: 'Oficina QA', cancelled: false, isFine: false, fineAmount: 0,
});
const cut = (amount) => ({
  salesTotal: amount, cashTotal: amount, companyCommission: amount / 2,
  employeeGrossPay: amount / 2, employeeCashDue: amount, result: amount / 2,
  direction: 'employee_owes_company', count: 1, finesTotal: 0,
  transportTotal: 0, cardTotal: 0, calculatedExtras: 0, membershipTotal: 0,
  promotionTotal: 0, nearbyTripsCount: 0, nearbyTripsCost: 0,
  customerTransportCharges: 0, employeeUberReimbursements: 0,
  cardExtrasTotal: 0, cardExtraCommission: 0,
});

// Historial neutral para probar el panel, sin iniciar ni modificar operaciones.
const photoMessageId = '11111111-1111-4111-8111-111111111111';
const inboxPhotoPath = `/telegram-conversations/messages/${photoMessageId}/photo`;
const inboxTimestamp = '2026-10-14T18:00:00.000Z';
const inboxMessage = (id, sessionId, clientId, mensaje, attachment) => ({
  id, clienteId: clientId, servicioId: null, bookingSessionId: sessionId,
  emisor: 'cliente', mensaje, iaActiva: false, enviadoAt: inboxTimestamp,
  ...(attachment ? { attachment } : {}),
});
const inboxThread = (sessionId, clientId, name, employeeIndex, messages) => ({
  conversationId: `session:${sessionId}`, bookingSessionId: sessionId,
  client: { id: clientId, name, telegramId: null },
  intendedEmployee: { id: employees[employeeIndex].id, name: employees[employeeIndex].nombreArtistico },
  service: null, messages, mode: 'HUMAN_ACTIVE', needsReply: true,
  lastMessage: messages.at(-1).mensaje, lastAt: inboxTimestamp, createdAt: inboxTimestamp,
  bookingData: {
    durationHours: null, openEndedDuration: false, paymentMethod: null,
    locationName: null, locationAddress: null, locationNotes: null,
  },
});
const inboxThreads = [
  inboxThread('fixture-thread-a', 'fixture-client-a', 'Cliente QA A', 0, [
    inboxMessage(photoMessageId, 'fixture-thread-a', 'fixture-client-a', 'Foto de referencia QA', {
      type: 'photo', url: `/api${inboxPhotoPath}`, width: 1, height: 1,
    }),
    inboxMessage('fixture-location', 'fixture-thread-a', 'fixture-client-a', 'Ubicación compartida QA', {
      type: 'location', latitude: 20.5888, longitude: -100.3899,
      title: 'Punto de referencia QA',
    }),
  ]),
  inboxThread('fixture-thread-b', 'fixture-client-a', 'Cliente QA A', 1, [
    inboxMessage('fixture-context-b', 'fixture-thread-b', 'fixture-client-a', 'Mensaje exclusivo del contexto B'),
  ]),
  inboxThread('fixture-thread-c', 'fixture-client-b', 'Cliente QA B', 2, [
    inboxMessage('fixture-client-b-message', 'fixture-thread-c', 'fixture-client-b', 'Mensaje exclusivo del cliente B'),
  ]),
];

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4311');
  if (request.method !== 'GET') {
    response.writeHead(405).end('Este servidor de pruebas solo permite lectura');
    return;
  }
  if (url.pathname.includes('/realtime/sse')) {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(': fixture\n\n');
    return;
  }
  if (url.pathname === `/api/v1${inboxPhotoPath}`) {
    if (!request.headers.cookie?.includes('fixture-jefe-inbox')) {
      response.writeHead(403).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' });
    response.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
    return;
  }
  if (url.pathname === '/api/v1/services' && request.headers.cookie?.includes('fixture-admin-error')) {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: 'Fuente de registros temporalmente no disponible' }));
    return;
  }
  const role = request.headers.cookie?.includes('fixture-jefe') ? 'jefe' : 'admin';
  const routes = {
    '/health': { ok: true },
    '/api/v1/auth/me': { id: `fixture-${role}`, rol: role, nombre: 'Cuenta QA', email: 'qa@example.test' },
    '/api/v1/employees': employees,
    '/api/v1/services': [],
    '/api/v1/telegram-conversations/pre-service': request.headers.cookie?.includes('fixture-jefe-inbox') ? inboxThreads : [],
    '/api/v1/liquidations/employees': [{
      id: employees[0].id, userId: 'fixture-user', name: 'Persona QA 01', active: true,
      bosses: [{ id: 'fixture-jefe', name: 'Equipo QA' }],
    }],
    '/api/v1/liquidations/report': {
      employee: { id: employees[0].id, name: 'Persona QA 01' },
      period: { startDate: url.searchParams.get('startDate'), endDate: url.searchParams.get('endDate') },
      officeCut: cut(1200), employeeCut: cut(1100), finalCut: cut(1200),
      officeRecords: [record('fixture-office', 'admin', 1200)],
      employeeRecords: [record('fixture-employee', 'empleada', 1100)],
      discrepancy: { exists: true, difference: 100 },
      serviceDiscrepancies: [{ serviceId: 'fixture-historical-record', officeTotal: 1200, employeeTotal: 1100, difference: 100 }],
      commissionSettings: { cardExtraCommissionPercentage: 0, cardExtraCommissionThreshold: 0 },
      weeklySettlement: {
        status: 'preview', grossEmployeePay: 600, cashOutstanding: 1200,
        cashOffset: 600, netEmployeePay: 0, remainingCashDebt: 600, confirmedAt: null,
      },
    },
  };
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(routes[url.pathname] ?? []));
});

server.listen(4311, '127.0.0.1');
