import {
  getHireSystemPrompt,
  getGeneralChatSystemPrompt,
  EmpleadaPromptParams,
} from './prompts';

describe('AI Prompts Generation (prompts.ts)', () => {
  const baseParams: EmpleadaPromptParams = {
    nombreArtistico: 'Camila',
    precioBaseHora: 1500,
    descripcion: 'Chica dulce y sensual',
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

    expect(prompt).toContain('COSTO DE TRANSPORTE REGISTRADO EN EL SISTEMA:');
    expect(prompt).toContain('En ubicaciones predeterminadas (moteles del sistema): $0 (Completamente GRATIS');
    expect(prompt).toContain('$120');
    expect(prompt).toContain('INFORMACIÓN DE TRANSPORTE Y TRASLADOS:');
  });

  it('incluye la regla estricta contra pactar ubicaciones en texto libre o lenguaje natural', () => {
    const prompt = getHireSystemPrompt(baseParams);

    expect(prompt).toContain('PROHIBIDO PACTAR O CONFIRMAR UBICACIONES POR TEXTO O LENGUAJE NATURAL');
    expect(prompt).toContain('UBICACIÓN EN PIN');
    expect(prompt).toContain('no conoces ese lugar');
  });

  it('condiciona los servicios extras, besos y lamidas a la higiene personal impecable del cliente', () => {
    const prompt = getHireSystemPrompt(baseParams);

    expect(prompt).toContain('SOBRE SERVICIOS EXTRAS, BESOS Y LAMIDAS');
    expect(prompt).toContain('HIGIENE PERSONAL INDISPENSABLE');
    expect(prompt).toContain('EXCELENTE HIGIENE');
    expect(prompt).toContain('NUNCA garantices besos ni lamidas por chat por adelantado');
  });

  it('incluye la aclaración del servicio extra "Atención a parejas"', () => {
    const prompt = getHireSystemPrompt(baseParams);

    expect(prompt).toContain('ATENCIÓN A PAREJAS');
    expect(prompt).toContain('pareja (ya sean novios, amantes, esposos o cualquier tipo de relación de pareja)');
  });

  it('contiene la directiva de continuidad de conversación sin cortes por longitud', () => {
    const prompt = getHireSystemPrompt(baseParams);

    expect(prompt).toContain('CONTINUIDAD DE LA CONVERSACIÓN: NUNCA dejes de responder ni cortes la conversación');
  });

  it('lista las modelos disponibles para trío y formatea la marca [TRIO_REQUEST]', () => {
    const prompt = getHireSystemPrompt(baseParams);

    expect(prompt).toContain('MODELOS DISPONIBLES PARA TRÍO:');
    expect(prompt).toContain('Valentina (ID: val-123)');
    expect(prompt).toContain('Tarifa combinada en trío: $2900/hr');
    expect(prompt).toContain('[TRIO_REQUEST: {"modeloId": "ID_DE_LA_MODELO", "modeloNombre": "NOMBRE_DE_LA_MODELO"}]');
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

    expect(prompt).toContain('¡ATENCIÓN! ESTE SERVICIO ES EN TRÍO CONFIRMADO CON VALENTINA.');
    expect(prompt).toContain('TARIFA COMBINADA PARA AMBAS: $2900/hr.');
  });
});
