export const clientMessages = {
  locationRequest: () =>
    `📍 *Listo, ya casi terminamos.*\n\nMándame tu ubicación como pin con el botón de abajo. Necesito la ubicación de Telegram, no una dirección escrita.`,
  paymentAndLocation: (hours: number, paymentMethod: string) =>
    `Tu servicio de ${hours} horas con pago por ${paymentMethod.toUpperCase()} ya quedó anotado. Ahora compárteme tu ubicación.`,
  onTheWay: (employeeName: string, driverName: string) =>
    `Ya voy en camino contigo. Soy *${employeeName}* y me acompaña el chofer *${driverName}*.`,
  arrived: (employeeName: string) =>
    `Ya llegué. Soy *${employeeName}* y estoy en el punto acordado.`,
};
