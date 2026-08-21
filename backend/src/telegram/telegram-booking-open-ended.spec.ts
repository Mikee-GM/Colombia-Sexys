import {
  buildConversationTranscript,
  detectGroupServiceIntent,
  detectOpenEndedDuration,
  roundOpenEndedHours,
  splitForTelegram,
} from './telegram-booking.update';

describe('Duración indefinida', () => {
  it.each([
    'quiero el servicio indefinido',
    'que sea abierto, sin límite de horas',
    'hasta que nos cansemos',
    'la verdad no se cuantas horas',
    'tiempo indeterminado',
  ])('detecta la intención de duración abierta en "%s"', (text) => {
    expect(detectOpenEndedDuration(text)).toBe(true);
  });

  it.each(['quiero dos horas', 'una hora nada más', 'a las 9 pm'])(
    'no confunde una duración normal con abierta en "%s"',
    (text) => {
      expect(detectOpenEndedDuration(text)).toBe(false);
    },
  );

  it('redondea hacia arriba a partir de los 15 minutos', () => {
    const hora = 3_600_000;
    const minuto = 60_000;
    expect(roundOpenEndedHours(2 * hora + 15 * minuto)).toBe(3);
    expect(roundOpenEndedHours(2 * hora + 14 * minuto)).toBe(2);
    expect(roundOpenEndedHours(2 * hora + 59 * minuto)).toBe(3);
    expect(roundOpenEndedHours(2 * hora)).toBe(2);
    expect(roundOpenEndedHours(10 * minuto)).toBe(1);
    expect(roundOpenEndedHours(0)).toBe(1);
    expect(roundOpenEndedHours(-5)).toBe(1);
  });
});

describe('Historial en un solo mensaje', () => {
  const mensajes = [
    { emisor: 'cliente', mensaje: 'Hola, ¿estás disponible?' },
    { emisor: 'ia', mensaje: 'Claro mor, cobro $1500/hr' },
    { emisor: 'sistema', mensaje: 'Ubicación recibida' },
    { emisor: 'jefe', mensaje: 'Tomo el control del chat' },
  ];

  it('arma un único texto con divisiones claras y todos los mensajes', () => {
    const transcript = buildConversationTranscript(mensajes);

    expect(transcript).toContain('HISTORIAL COMPLETO DE LA CONVERSACIÓN');
    expect(transcript).toContain('(4 mensajes)');
    expect(transcript).toContain('1. 👤 CLIENTE');
    expect(transcript).toContain('2. 💬 MODELO');
    expect(transcript).toContain('3. ⚙️ SISTEMA');
    expect(transcript).toContain('4. 🧑‍💼 JEFE');
    for (const item of mensajes) {
      expect(transcript).toContain(item.mensaje);
    }
    expect(transcript).toContain('FIN DEL HISTORIAL');
  });

  it('no divide el historial mientras quepa en un mensaje de Telegram', () => {
    const transcript = buildConversationTranscript(mensajes);
    expect(splitForTelegram(transcript)).toHaveLength(1);
  });

  it('solo divide cuando se rebasa el límite duro de Telegram', () => {
    const largo = Array.from({ length: 400 }, (_, index) => ({
      emisor: index % 2 === 0 ? 'cliente' : 'ia',
      mensaje: `Mensaje número ${index} con bastante texto para llenar el bloque.`,
    }));
    const transcript = buildConversationTranscript(largo);
    const partes = splitForTelegram(transcript);

    expect(partes.length).toBeGreaterThan(1);
    expect(partes.every((parte) => parte.length <= 4096)).toBe(true);
    // Ningún mensaje se pierde al dividir.
    const recompuesto = partes.join('\n');
    for (const item of largo) {
      expect(recompuesto).toContain(item.mensaje);
    }
  });
});

describe('Intención de servicio grupal', () => {
  it.each([
    ['quiero 3 chicas', 'grupal'],
    ['me late una orgia', 'grupal'],
    ['servicios grupales manejan?', 'grupal'],
    ['quiero dos modelos', 'incierta'],
    ['puedes traer otra chica mas', 'incierta'],
    ['solo contigo mi amor', 'individual'],
  ])('clasifica "%s" como %s', (text, expected) => {
    expect(detectGroupServiceIntent(text)).toBe(expected);
  });
});
