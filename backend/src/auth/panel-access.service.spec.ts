import { Logger, UnauthorizedException } from '@nestjs/common';
import { PanelAccessService } from './panel-access.service';

/**
 * El pase abre sesion sin contrasena, asi que lo que importa no es que
 * funcione, sino que no funcione dos veces, ni fuera de plazo, ni en otro chat.
 */
/**
 * Forma real de un UPDATE ... RETURNING en el driver de Postgres de TypeORM:
 * `[filas, afectadas]`, no las filas peladas. Los mocks devolvian lo segundo y
 * por eso las pruebas pasaban mientras produccion respondia 500.
 */
function filasDeUpdate(filas: unknown[]): [unknown[], number] {
  return [filas, filas.length];
}

describe('PanelAccessService', () => {
  const tokens = {
    save: jest.fn(),
    create: jest.fn((v) => v),
    query: jest.fn(),
  };
  const usuarios = { findOne: jest.fn() };
  const configService = {
    get: jest.fn((clave: string) =>
      clave === 'PANEL_BASE_URL' ? 'https://panel.example.com' : undefined,
    ),
  };

  /*
   * Se construye por nombre y no con `new`.
   *
   * Con la lista posicional, cada dependencia nueva del servicio desplazaba todos
   * los dobles y estas pruebas fallaban por un motivo ajeno a lo que probaban.
   * Los campos inicializados de la clase entran como dobles porque
   * `Object.create` no los ejecuta.
   */
  const service = Object.create(
    PanelAccessService.prototype,
  ) as PanelAccessService;
  Object.assign(service, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    tokens,
    usuarios,
    configService,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    usuarios.findOne.mockResolvedValue({ id: 'jefe-1', activo: true });
  });

  describe('issueLink', () => {
    it('guarda solo la huella y devuelve el enlace una vez', async () => {
      const { url } = await service.issueLink(
        'jefe-1',
        '555',
        '/admin/services/abc',
      );

      const guardado = tokens.save.mock.calls[0][0];
      expect(guardado.tokenHash).toHaveLength(64);
      expect(url).toContain('https://panel.example.com/acceso/');
      // El pase en claro nunca se guarda: no debe aparecer en la fila.
      const enClaro = url.split('/acceso/')[1];
      expect(guardado.tokenHash).not.toBe(enClaro);
      expect(guardado.redirectPath).toBe('/admin/services/abc');
    });

    it('descarta un destino que apunte fuera del panel', async () => {
      await service.issueLink('jefe-1', '555', 'https://sitio-ajeno.com/roba');

      expect(tokens.save.mock.calls[0][0].redirectPath).toBeNull();
    });

    it('admite una seccion en la cadena de consulta', async () => {
      // El aviso de fotos aterriza directamente donde se suben.
      await service.issueLink('emp-1', '555', '/empleada/portal?seccion=fotos');

      expect(tokens.save.mock.calls[0][0].redirectPath).toBe(
        '/empleada/portal?seccion=fotos',
      );
    });

    it('descarta destinos protocolo-relativos y con esquema en la consulta', async () => {
      // `//host` sale del sitio sin llevar esquema delante.
      for (const destino of [
        '//sitio-ajeno.com',
        '/empleada/portal?next=https://sitio-ajeno.com',
        '/empleada/portal?a=b#//sitio-ajeno.com',
      ]) {
        tokens.save.mockClear();
        await service.issueLink('emp-1', '555', destino);
        expect(tokens.save.mock.calls[0][0].redirectPath).toBeNull();
      }
    });

    it('no emite pases para un usuario inactivo', async () => {
      usuarios.findOne.mockResolvedValue({ id: 'jefe-1', activo: false });

      await expect(service.issueLink('jefe-1', '555')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('consume', () => {
    it('canjea un pase vigente y devuelve a donde llevar al jefe', async () => {
      tokens.query.mockResolvedValue(
        filasDeUpdate([
          {
            userId: 'jefe-1',
            chatId: '555',
            redirectPath: '/admin/services/abc',
          },
        ]),
      );

      const result = await service.consume('pase-en-claro', '555');

      expect(result.user.id).toBe('jefe-1');
      expect(result.redirectPath).toBe('/admin/services/abc');
      // El marcado como usado va en el propio UPDATE, no en una lectura previa.
      const [sql, params] = tokens.query.mock.calls[0];
      expect(sql).toContain('SET used_at = COALESCE(used_at, now())');
      expect(sql).toContain('expires_at > now()');
      // El plazo lo pone la base, no el reloj del proceso.
      expect(sql).toContain('used_at > now() - $2::interval');
      expect(params[1]).toMatch(/^\d+ seconds$/);
    });

    /*
     * El pase se gasta con abrir el enlace, y Telegram lo abre solo al
     * previsualizarlo: con un unico uso, la apertura de verdad llegaba tarde y
     * el portal respondia que el enlace ya no valia. La ventana de cortesia la
     * evalua la propia consulta, asi que aqui se comprueba que la condicion va
     * escrita y que la fila que devuelve se acepta como cualquier otra.
     */
    it('admite el mismo pase dentro de la ventana de cortesia', async () => {
      tokens.query.mockResolvedValue(
        filasDeUpdate([
          { userId: 'jefe-1', chatId: '555', redirectPath: '/admin' },
        ]),
      );

      const primero = await service.consume('pase', '555');
      const segundo = await service.consume('pase', '555');

      expect(primero.user.id).toBe('jefe-1');
      expect(segundo.user.id).toBe('jefe-1');
      expect(segundo.redirectPath).toBe('/admin');
    });

    it('no renueva la ventana en cada reintento: used_at se fija una sola vez', async () => {
      tokens.query.mockResolvedValue(
        filasDeUpdate([{ userId: 'jefe-1', chatId: null, redirectPath: null }]),
      );

      await service.consume('pase');

      // Sin el COALESCE, cada reapertura correria used_at y el pase valdria
      // mientras alguien lo siguiera abriendo.
      expect(tokens.query.mock.calls[0][0]).not.toMatch(
        /SET\s+used_at\s*=\s*now\(\)/,
      );
    });

    it('rechaza un pase caducado o con la cortesia ya agotada', async () => {
      // La base no devuelve fila: ni sin usar, ni dentro del plazo, ni vigente.
      tokens.query.mockResolvedValue(filasDeUpdate([]));

      await expect(service.consume('pase', '555')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza el pase abierto desde un chat distinto al que lo pidio', async () => {
      tokens.query.mockResolvedValue(
        filasDeUpdate([
          { userId: 'jefe-1', chatId: '555', redirectPath: null },
        ]),
      );

      await expect(service.consume('pase', '999')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza el pase de una cuenta desactivada despues de emitirlo', async () => {
      tokens.query.mockResolvedValue(
        filasDeUpdate([{ userId: 'jefe-1', chatId: null, redirectPath: null }]),
      );
      usuarios.findOne.mockResolvedValue({ id: 'jefe-1', activo: false });

      await expect(service.consume('pase')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('no llega a consultar el usuario cuando el pase ya no vale', async () => {
      // El sintoma en produccion: la fila vacia se colaba y la consulta salia
      // con id undefined, devolviendo 500 en vez de rechazar el acceso.
      tokens.query.mockResolvedValue(filasDeUpdate([]));

      await expect(service.consume('pase', '555')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usuarios.findOne).not.toHaveBeenCalled();
    });

    it('rechaza una fila sin userId en vez de consultar con undefined', async () => {
      tokens.query.mockResolvedValue(filasDeUpdate([{ chatId: '555' }]));

      await expect(service.consume('pase', '555')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usuarios.findOne).not.toHaveBeenCalled();
    });

    it('tolera un driver que devuelva las filas sin envolver', async () => {
      tokens.query.mockResolvedValue([
        { userId: 'jefe-1', chatId: null, redirectPath: null },
      ]);

      const result = await service.consume('pase');

      expect(result.user.id).toBe('jefe-1');
    });

    it('rechaza un pase vacio sin tocar la base', async () => {
      await expect(service.consume('')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(tokens.query).not.toHaveBeenCalled();
    });
  });
});

/**
 * El origen del enlace se resolvia solo desde PANEL_BASE_URL, que no existe en
 * el despliegue: los enlaces salian a localhost y Telegram rechazaba el mensaje
 * entero por no ser https.
 */
describe('PanelAccessService origen del enlace', () => {
  function build(env: Record<string, string | undefined>) {
    const tokens = {
      save: jest.fn(),
      create: jest.fn((v) => v),
      query: jest.fn(),
    };
    const usuarios = {
      findOne: jest.fn().mockResolvedValue({ id: 'u-1', activo: true }),
    };
    const configService = { get: jest.fn((clave: string) => env[clave]) };
    return new PanelAccessService(
      tokens as any,
      usuarios as any,
      configService as any,
    );
  }

  it('usa WEB_URL cuando no hay PANEL_BASE_URL, que es lo que hay desplegado', async () => {
    const service = build({ WEB_URL: 'https://rvcs-pruebas.com.mx' });

    const { url } = await service.issueLink('u-1', null);

    expect(url.startsWith('https://rvcs-pruebas.com.mx/acceso/')).toBe(true);
  });

  it('completa con https un origen configurado sin esquema', async () => {
    const service = build({ WEB_URL: 'rvcs-pruebas.com.mx' });

    const { url } = await service.issueLink('u-1', null);

    expect(url.startsWith('https://rvcs-pruebas.com.mx/acceso/')).toBe(true);
  });

  it('respeta el orden de preferencia entre las tres variables', async () => {
    const service = build({
      PANEL_BASE_URL: 'https://panel.example.com',
      WEB_URL: 'https://otro.example.com',
    });

    const { url } = await service.issueLink('u-1', null);

    expect(url.startsWith('https://panel.example.com/acceso/')).toBe(true);
  });

  it('quita la barra final para no generar una doble', async () => {
    const service = build({ WEB_URL: 'https://panel.example.com/' });

    const { url } = await service.issueLink('u-1', null);

    expect(url).not.toContain('//acceso');
  });

  /*
   * `0.0.0.0` es la direccion con la que un servidor dice "escucho en todas mis
   * interfaces", y se cuela en la variable del enlace con facilidad porque es
   * justo lo que se configura para que el proceso acepte conexiones de fuera.
   * Como destino no vale: el enlace llega al personal y no abre en ningun
   * navegador. Desde el backend se ve bien formado, asi que si no se avisa aqui
   * el fallo no deja rastro en ningun log.
   */
  it('avisa cuando el origen es una direccion de escucha y no un destino', async () => {
    const service = build({ WEB_URL: 'http://0.0.0.0:3000' });
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await service.issueLink('u-1', null);

    expect(error).toHaveBeenCalledTimes(1);
    const mensaje = error.mock.calls[0][0] as string;
    expect(mensaje).toContain('0.0.0.0');
    // El aviso tiene que nombrar la variable que hay que corregir.
    expect(mensaje).toContain('PANEL_BASE_URL');
    error.mockRestore();
  });

  it('tambien avisa con la direccion de escucha de IPv6', async () => {
    const service = build({ WEB_URL: 'http://[::]:3000' });
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await service.issueLink('u-1', null);

    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('no avisa de un origen publico correcto', async () => {
    const service = build({ WEB_URL: 'https://rvcs-pruebas.com.mx' });
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await service.issueLink('u-1', null);

    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
