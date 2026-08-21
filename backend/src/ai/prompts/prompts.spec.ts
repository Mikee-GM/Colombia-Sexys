import {
  getHireSystemPrompt,
  detectKissingPolicy,
  EmpleadaPromptParams,
} from './prompts';

describe('AI Prompts Generation (prompts.ts)', () => {
  const baseParams: EmpleadaPromptParams = {
    nombreArtistico: 'Camila',
    precioBaseHora: 1500,
    descripcion: 'Chica dulce y sensual, 1.68 m, 58 kg',
    costoTransporteExterno: 120,
    ubicacionesPreestablecidas: ['Motel Venus (Av. Principal #123)'],
    extras: [
      {
        nombre: 'Atención a parejas',
        precio: 800,
      },
      {
        nombre: 'Trío con amiga',
        precio: 1500,
        modelosVinculadasNombres: ['Valentina'],
      },
    ],
    modelosDisponiblesTrio: [
      {
        id: 'val-123',
        nombre: 'Valentina',
        precioBaseHora: 1400,
      },
    ],
  };

  it('incluye las reglas de tarifas de transporte correctamente', () => {
    const prompt = getHireSystemPrompt(baseParams);

    expect(prompt).toContain('COSTO DE TRANSPORTE:');
    expect(prompt).toContain(
      'En los moteles donde atiendes habitualmente: $0 (Completamente GRATIS',
    );
    expect(prompt).toContain('$120');
  });

  it('nunca instruye a la modelo a hablar de "el sistema" con el cliente', () => {
    const prompt = getHireSystemPrompt(baseParams);

    expect(prompt).toContain('ERES UNA PERSONA REAL');
    expect(prompt).toContain('los moteles donde atiendo');
    expect(prompt).toContain(
      'MOTELES DONDE ATIENDES HABITUALMENTE (ÚNICOS LUGARES PROPIOS QUE PUEDES NOMBRAR)',
    );
    expect(prompt).not.toContain('UBICACIONES PREESTABLECIDAS EN EL SISTEMA');
    expect(prompt).not.toContain(
      'COSTO DE TRANSPORTE REGISTRADO EN EL SISTEMA',
    );
    // "moteles del sistema" solo puede aparecer como ejemplo de lo que NO debe decir.
    const menciones = prompt.match(/moteles del sistema/g) ?? [];
    expect(menciones).toHaveLength(1);
    expect(prompt).toContain('En vez de "los moteles del sistema"');
  });

  it('incluye la regla estricta contra pactar ubicaciones en texto libre o lenguaje natural', () => {
    const prompt = getHireSystemPrompt(baseParams);

    expect(prompt).toContain(
      'PROHIBIDO PACTAR O CONFIRMAR UBICACIONES POR TEXTO O LENGUAJE NATURAL',
    );
    expect(prompt).toContain('UBICACIÓN EN PIN');
    expect(prompt).toContain('NO CONOCES ESE LUGAR');
  });

  it('deja de pedir la ubicación cuando el cliente ya la envió', () => {
    const prompt = getHireSystemPrompt({
      ...baseParams,
      ubicacionConfirmada: 'Pin enviado por el cliente',
    });

    expect(prompt).toContain('EL CLIENTE YA TE DIO LA UBICACIÓN');
    expect(prompt).toContain('BAJO NINGUNA CIRCUNSTANCIA le vuelva');
    expect(prompt).not.toContain(
      'ES 100% EL CLIENTE QUIEN DECIDE LA UBICACIÓN',
    );
  });

  it('condiciona los servicios extras, besos y lamidas a la higiene personal impecable del cliente', () => {
    const prompt = getHireSystemPrompt(baseParams);

    expect(prompt).toContain('EXTRAS, BESOS Y LAMIDAS');
    expect(prompt).toContain('HIGIENE PERSONAL INDISPENSABLE');
    expect(prompt).toContain('EXCELENTE HIGIENE');
    expect(prompt).toContain(
      'NUNCA garantices besos ni lamidas por chat por adelantado',
    );
  });

  it('deriva la política de besos desde la descripción de la modelo', () => {
    expect(detectKissingPolicy('Muy cariñosa, besos bien dados')).toBe(
      'besos_bien_dados',
    );
    expect(detectKissingPolicy('Dulce y sensual, no doy besos')).toBe(
      'no_besa',
    );
    expect(detectKissingPolicy('Me encantan los besos')).toBe('besos');
    expect(detectKissingPolicy('Chica alegre')).toBe('sin_dato');

    const noKiss = getHireSystemPrompt({
      ...baseParams,
      descripcion: 'Dulce y sensual, no doy besos',
    });
    expect(noKiss).toContain('Tú NO das besos en la boca');
    expect(noKiss).toContain('higiene impecable');

    const goodKiss = getHireSystemPrompt({
      ...baseParams,
      descripcion: 'Muy cariñosa, besos bien dados',
    });
    expect(goodKiss).toContain('los das MUY BIEN');
  });

  it('separa "atención a parejas" de los tríos y respeta el speech personalizado', () => {
    const prompt = getHireSystemPrompt(baseParams);
    expect(prompt).toContain('ATENCIÓN A PAREJAS');
    expect(prompt).toContain('NO ES UN TRÍO Y NUNCA DEBES CONFUNDIRLO CON UNO');

    const conSpeech = getHireSystemPrompt({
      ...baseParams,
      extras: [
        {
          nombre: 'Atención a parejas',
          precio: 800,
          speechPersonalizado: 'Amor, con tu pareja los consiento a los dos.',
        },
      ],
    });
    expect(conSpeech).toContain('Amor, con tu pareja los consiento a los dos.');
    expect(conSpeech).toContain('respétalo palabra por palabra');
  });

  it('prohíbe el roleplay y los tiempos estimados de llegada', () => {
    const prompt = getHireSystemPrompt(baseParams);

    expect(prompt).toContain('PROHIBIDO EL ROLEPLAY O LA NARRACIÓN DE LA CITA');
    expect(prompt).toContain('PROHIBIDO HABLAR DE TIEMPOS DE LLEGADA');
    expect(prompt).toContain('¿en qué habitación estás?');
  });

  it('prohíbe presionar por los datos y cerrar respuestas con preguntas de datos', () => {
    const prompt = getHireSystemPrompt(baseParams);

    expect(prompt).toContain(
      'EN TU PRIMER MENSAJE (saludo inicial) ESTÁ PROHIBIDO PREGUNTAR POR HORAS, MÉTODO DE PAGO O UBICACIÓN',
    );
    expect(prompt).toContain('REGLA DEL CIERRE LIMPIO');
  });

  it('aclara que es una sola relación por hora', () => {
    const prompt = getHireSystemPrompt(baseParams);

    expect(prompt).toContain('UNA SOLA RELACIÓN POR HORA');
  });

  it('describe la modalidad de duración indefinida y su redondeo', () => {
    const prompt = getHireSystemPrompt(baseParams);
    expect(prompt).toContain('DURACIÓN INDEFINIDA / ABIERTA');
    expect(prompt).toContain(
      'redondea hacia arriba a partir de los 15 minutos',
    );
    expect(prompt).toContain('"duracion": "indefinida"');

    const yaIndefinida = getHireSystemPrompt({
      ...baseParams,
      duracionIndefinida: true,
    });
    expect(yaIndefinida).toContain('EL CLIENTE YA ELIGIÓ DURACIÓN INDEFINIDA');
  });

  it('impide volver a pedir el comprobante ya recibido', () => {
    const prompt = getHireSystemPrompt({
      ...baseParams,
      comprobanteRecibido: true,
    });

    expect(prompt).toContain('YA TE ENVIÓ EL COMPROBANTE');
    expect(prompt).toContain('PROHIBIDO volvérselo a pedir');
  });

  it('impide dar por aceptado un servicio que no lo está', () => {
    const prompt = getHireSystemPrompt(baseParams);
    expect(prompt).toContain('EL SERVICIO AÚN NO HA SIDO ACEPTADO');
    expect(prompt).toContain('ya voy en camino');

    const aceptado = getHireSystemPrompt({
      ...baseParams,
      servicioAceptado: true,
    });
    expect(aceptado).toContain('El servicio YA FUE ACEPTADO');
  });

  it('contiene la directiva de continuidad de conversación sin cortes por longitud', () => {
    const prompt = getHireSystemPrompt(baseParams);

    expect(prompt).toContain(
      'CONTINUIDAD DE LA CONVERSACIÓN: NUNCA dejes de responder ni cortes la conversación',
    );
  });

  it('lista las modelos disponibles para trío y formatea la marca [TRIO_REQUEST]', () => {
    const prompt = getHireSystemPrompt(baseParams);

    expect(prompt).toContain('MODELOS DISPONIBLES PARA TRÍO:');
    expect(prompt).toContain('Valentina (ID: val-123)');
    expect(prompt).toContain('Tarifa combinada en trío: $2900/hr');
    expect(prompt).toContain(
      '[TRIO_REQUEST: {"modeloId": "ID_DE_LA_MODELO", "modeloNombre": "NOMBRE_DE_LA_MODELO"}]',
    );
  });

  it('expone otras modelos disponibles y prohíbe negar disponibilidad', () => {
    const prompt = getHireSystemPrompt({
      ...baseParams,
      otrasModelosDisponibles: [
        { id: 'sof-1', nombre: 'Sofía', precioBaseHora: 1300 },
      ],
    });

    expect(prompt).toContain('OTRAS COMPAÑERAS DISPONIBLES AHORA MISMO');
    expect(prompt).toContain('Sofía (ID: sof-1)');
    expect(prompt).toContain(
      'ESTÁ PROHIBIDO DECIR QUE NO HAY CHICAS DISPONIBLES',
    );
    expect(prompt).toContain('[SEND_MODEL_PHOTO:');
  });

  it('incluye encabezado especial cuando el trío ya ha sido confirmado', () => {
    const confirmedParams: EmpleadaPromptParams = {
      ...baseParams,
      trioConfirmado: {
        id: 'val-123',
        nombre: 'Valentina',
        precioCombinadoHora: 2900,
      },
    };

    const prompt = getHireSystemPrompt(confirmedParams);

    expect(prompt).toContain(
      '¡ATENCIÓN! ESTE SERVICIO ES EN TRÍO CONFIRMADO CON VALENTINA.',
    );
    expect(prompt).toContain('TARIFA COMBINADA PARA AMBAS: $2900/hr.');
  });
});
