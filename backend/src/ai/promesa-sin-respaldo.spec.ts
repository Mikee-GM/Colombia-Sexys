import {
  esUnaPromesaSinRespaldo,
  modeloNombradaEnLaRespuesta,
} from './ai-guardrails';

/**
 * "Dejame checar y te aviso" es como sale del paso el modelo cuando no sabe que
 * contestar, y por si sola no despierta a nadie. Un cliente pidio un trio y se
 * quedo media hora leyendo "te aviso apenas me responda" mientras el jefe no
 * tenia ni idea de que existiera esa peticion.
 */
describe('esUnaPromesaSinRespaldo', () => {
  const promesas = [
    'Uy qué chimba, déjame checar con Isabella y te aviso en un ratico.',
    'Listo mi vida, ya le escribo a Isabella.',
    'De una, te aviso en un ratico',
    'Te aviso apenas me responda, ¿cómo vas?',
    'Ahorita te digo, deja que consulto',
    'Lo pregunto y te aviso',
    'En cuanto me conteste te escribo',
  ];

  it.each(promesas)('reconoce la promesa: %s', (texto) => {
    expect(esUnaPromesaSinRespaldo(texto)).toBe(true);
  });

  /*
   * Una respuesta de verdad no puede contarse como promesa: si contara, dos
   * mensajes normales seguidos acabarian echando la conversacion al jefe.
   */
  const respuestasDeVerdad = [
    'Mi hora está en 3000, papi',
    'Sí puedo a domicilio, mándame tu ubicación',
    'Estoy disponible ahorita mismo',
    '¿A qué hora te gustaría?',
    'Claro que sí, dime cuántas horas',
  ];

  it.each(respuestasDeVerdad)('no marca una respuesta normal: %s', (texto) => {
    expect(esUnaPromesaSinRespaldo(texto)).toBe(false);
  });
});

/**
 * Cuando el cliente pide un trio sin decir con quien, es el modelo el que
 * elige y lo dice en voz alta. Esa frase es un compromiso delante del cliente y
 * sirve de llave para trasladarle la peticion al jefe.
 */
describe('modeloNombradaEnLaRespuesta', () => {
  const candidatas = [
    { id: 'emp-1', nombre: 'Isabella Moretti' },
    { id: 'emp-2', nombre: 'Camila Rojas' },
  ];

  it('encuentra a la que nombró el modelo', () => {
    expect(
      modeloNombradaEnLaRespuesta(
        'Uy qué chimba, déjame checar con Isabella y te aviso en un ratico.',
        candidatas,
      ),
    ).toEqual(candidatas[0]);
  });

  it('la reconoce aunque solo use el apellido', () => {
    expect(
      modeloNombradaEnLaRespuesta('Ya le escribo a Rojas', candidatas),
    ).toEqual(candidatas[1]);
  });

  /* Con dos nombradas no se adivina cual quiere el cliente. */
  it('no elige si nombró a varias', () => {
    expect(
      modeloNombradaEnLaRespuesta(
        'Puedo con Isabella o con Camila, ¿cuál prefieres?',
        candidatas,
      ),
    ).toBeNull();
  });

  it('no inventa una si no nombró a nadie', () => {
    expect(
      modeloNombradaEnLaRespuesta('Déjame checar y te aviso', candidatas),
    ).toBeNull();
  });
});
