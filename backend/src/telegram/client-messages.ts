export const clientMessages = {
  locationRequest: () =>
    `*¡Ya casi estamos mi amor!*\n\nCompárteme tu ubicación como pin usando el botón de abajo (debe ser la ubicación exacta de Telegram, no la escribas como texto).`,
  paymentAndLocation: (hours: number, paymentMethod: string) =>
    `¡De una lindo! Tu servicio de ${hours} ${hours === 1 ? 'hora' : 'horas'} con pago por ${paymentMethod.toUpperCase()} ya quedó anotado. Ahora compárteme tu ubicación.`,
  onTheWay: (employeeName: string, driverName: string) =>
    `Ya voy en camino contigo mi amor. Soy *${employeeName}* y me acompaña el chofer *${driverName}*.`,
  arrived: (employeeName: string) =>
    `Ya llegué lindo. Soy *${employeeName}* y estoy en el punto acordado.`,
};
