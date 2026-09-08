import { TelegramBookingUpdate } from './telegram-booking.update';
import { getHireSystemPrompt } from '../ai/prompts/prompts';

/**
 * Cobertura del servicio.
 *
 * El fallo que cubren estas pruebas: el bot aceptaba cualquier pin del mundo.
 * Un cliente de Durango --a unos 600 km-- mando su ubicacion, se le aplico la
 * tarifa plana de ubicacion externa, se le cotizo el total y se le pregunto
 * como queria pagar. El servicio habria nacido igual.
 *
 * Como en el resto de pruebas de este manejador, se invocan los metodos sobre
 * un objeto vacio en vez de levantar la clase entera con sus dos docenas de
 * dependencias.
 */
type Privados = {
  ubicacionFueraDeCobertura(
    lat: number,
    lng: number,
  ): Promise<{ ciudad: string; distanciaKm: number } | null>;
  transportOperations: { coverageArea: jest.Mock };
  logger: { warn: jest.Mock; error: jest.Mock };
};

const QUERETARO = { lat: 20.5888, lng: -100.3899 };
const DURANGO = { lat: 24.013241, lng: -104.639611 };

function nuevaInstancia(coverageArea: jest.Mock): { privados: Privados } {
  const instancia = Object.create(
    TelegramBookingUpdate.prototype,
  ) as TelegramBookingUpdate;
  const privados = instancia as unknown as Privados;
  privados.transportOperations = { coverageArea };
  privados.logger = { warn: jest.fn(), error: jest.fn() };
  return { privados };
}

const areaQueretaro = {
  ciudad: 'Querétaro',
  centroLat: QUERETARO.lat,
  centroLng: QUERETARO.lng,
  radioKm: 45,
};

describe('Área de cobertura del servicio', () => {
  it('rechaza el pin que motivó el fallo: Durango contra Querétaro', async () => {
    const { privados } = nuevaInstancia(
      jest.fn().mockResolvedValue(areaQueretaro),
    );

    const rechazo = await privados.ubicacionFueraDeCobertura(
      DURANGO.lat,
      DURANGO.lng,
    );

    expect(rechazo).not.toBeNull();
    expect(rechazo!.ciudad).toBe('Querétaro');
    expect(rechazo!.distanciaKm).toBeGreaterThan(500);
  });

  it('acepta un pin dentro de la zona metropolitana', async () => {
    const { privados } = nuevaInstancia(
      jest.fn().mockResolvedValue(areaQueretaro),
    );

    // Juriquilla, al norte de la ciudad: unos 12 km del centro.
    await expect(
      privados.ubicacionFueraDeCobertura(20.7003, -100.4472),
    ).resolves.toBeNull();
  });

  it('acepta el propio centro del área', async () => {
    const { privados } = nuevaInstancia(
      jest.fn().mockResolvedValue(areaQueretaro),
    );
    await expect(
      privados.ubicacionFueraDeCobertura(QUERETARO.lat, QUERETARO.lng),
    ).resolves.toBeNull();
  });

  /*
   * Sin area configurada o con la base caida se deja pasar el pin: rechazar a
   * un cliente bueno lo pierde para siempre, mientras que un servicio fuera de
   * zona que se cuele todavia tiene que pasar por la aceptacion de un jefe.
   */
  it('deja pasar el pin si no hay área configurada, y lo avisa', async () => {
    const { privados } = nuevaInstancia(jest.fn().mockResolvedValue(null));

    await expect(
      privados.ubicacionFueraDeCobertura(DURANGO.lat, DURANGO.lng),
    ).resolves.toBeNull();
    expect(privados.logger.warn).toHaveBeenCalled();
  });

  it('deja pasar el pin si la consulta falla, y registra el error', async () => {
    const { privados } = nuevaInstancia(
      jest.fn().mockRejectedValue(new Error('sin conexión')),
    );

    await expect(
      privados.ubicacionFueraDeCobertura(DURANGO.lat, DURANGO.lng),
    ).resolves.toBeNull();
    expect(privados.logger.error).toHaveBeenCalled();
  });
});

describe('La ciudad en el prompt de la modelo', () => {
  const base = { nombreArtistico: 'Valentina', precioBaseHora: 2500 };

  it('nombra la ciudad y prohíbe la vaguedad de "aquí en la ciudad"', () => {
    const prompt = getHireSystemPrompt({
      ...base,
      ciudadOperacion: 'Querétaro',
    });

    expect(prompt).toContain('atiendes en Querétaro y sus alrededores');
    expect(prompt).toContain('QUERÉTARO');
  });

  /*
   * El bot contestó "no conozco Durango" y acto seguido pidió el pin. Ahora la
   * regla de pedir el pin queda acotada a direcciones y locales, y un topónimo
   * de ciudad o estado se contesta diciendo hasta dónde se llega.
   */
  it('no permite decir que no conoce una ciudad', () => {
    const prompt = getHireSystemPrompt({
      ...base,
      ciudadOperacion: 'Querétaro',
    });

    expect(prompt).toContain('NUNCA PARA UNA CIUDAD O UN ESTADO');
    expect(prompt).not.toContain('NO CONOCES ESE LUGAR');
  });

  it('corta el embudo cuando el cliente ya quedó fuera de cobertura', () => {
    const prompt = getHireSystemPrompt({
      ...base,
      ciudadOperacion: 'Querétaro',
      clienteFueraDeCobertura: true,
    });

    expect(prompt).toContain('LE QUEDA LEJÍSIMOS');
    expect(prompt).toContain('volver a pedirle el pin');
  });

  it('omite el bloque de cobertura si no hay ciudad configurada', () => {
    const prompt = getHireSystemPrompt(base);
    expect(prompt).not.toContain('y sus alrededores');
  });
});

/**
 * Repeticiones. El prompt prohibia sonar a plantilla desde siempre y aun asi la
 * modelo abrio quince de veinticinco mensajes igual: no le faltaba la regla, le
 * faltaba saber en que se habia convertido su propia conversacion.
 */
describe('Lo que el prompt le recuerda que ya dijo', () => {
  const base = { nombreArtistico: 'Valentina', precioBaseHora: 2500 };

  it('le nombra las aperturas que ya gastó', () => {
    const prompt = getHireSystemPrompt({
      ...base,
      aperturasRecientes: ['ay mi vida', 'uy mor'],
    });

    expect(prompt).toContain('APERTURAS QUE YA GASTASTE');
    expect(prompt).toContain('"ay mi vida"');
    expect(prompt).toContain('"uy mor"');
  });

  it('le prohíbe volver a cotizar un extra que el cliente ya aceptó', () => {
    const prompt = getHireSystemPrompt({
      ...base,
      extrasYaCotizados: ['Oral con terminación en boca'],
    });

    expect(prompt).toContain('EXTRAS QUE YA LE COTIZASTE');
    expect(prompt).toContain('Oral con terminación en boca');
  });

  it('no mete ninguno de los dos bloques cuando no hay nada que recordarle', () => {
    const prompt = getHireSystemPrompt(base);
    expect(prompt).not.toContain('APERTURAS QUE YA GASTASTE');
    expect(prompt).not.toContain('EXTRAS QUE YA LE COTIZASTE');
  });
});

/**
 * Los dos momentos delicados del embudo, y las dos contradicciones de producto
 * que dejaban al cliente creyendo algo que no era.
 */
describe('Momentos en los que el guion normal se equivoca', () => {
  const base = { nombreArtistico: 'Valentina', precioBaseHora: 2500 };

  it('prohíbe cualquier pregunta comercial tras una confesión', () => {
    const prompt = getHireSystemPrompt({ ...base, clienteInseguro: true });

    expect(prompt).toContain('EL CLIENTE ACABA DE ABRIRSE CONTIGO');
    expect(prompt).toContain('PROHIBIDO PREGUNTARLE NADA DEL TRATO');
  });

  it('da un solo intento de retener al que se despide, sin regalar nada', () => {
    const prompt = getHireSystemPrompt({ ...base, clienteSeEstaYendo: true });

    expect(prompt).toContain('SE ESTÁ DESPIDIENDO SIN CERRAR');
    expect(prompt).toContain('UN intento de retenerlo');
    expect(prompt).toContain('PROHIBIDO bajar tu tarifa');
  });

  it('no mete ninguno de los dos bloques en una conversación normal', () => {
    const prompt = getHireSystemPrompt(base);
    expect(prompt).not.toContain('ACABA DE ABRIRSE CONTIGO');
    expect(prompt).not.toContain('SE ESTÁ DESPIDIENDO SIN CERRAR');
  });

  /*
   * El cliente dijo "son relaciones ilimitadas" y la respuesta le habló de
   * cómo se cobra el servicio abierto, que es otra cosa. Se fue creyendo que sí
   * lo eran, con una hora contratada.
   */
  it('no deja confundir el servicio abierto con relaciones ilimitadas', () => {
    const prompt = getHireSystemPrompt(base);
    expect(prompt).toContain('"ILIMITADO" NO EXISTE');
    expect(prompt).toContain(
      'NO CONFUNDAS EL SERVICIO ABIERTO CON LAS RELACIONES ILIMITADAS',
    );
  });

  it('trata las fantasías como un juego, no como un extra que no existe', () => {
    const prompt = getHireSystemPrompt(base);
    expect(prompt).toContain('FANTASÍAS Y JUEGOS DE ROL');
    expect(prompt).toContain('NUNCA CON UN "NO" SECO');
  });
});
