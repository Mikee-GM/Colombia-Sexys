import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LessThan, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { PanelAccessToken } from './entities/panel-access-token.entity';
import { Usuarios } from '../users/entities/user.entity';

/** Vida del pase. Corta a proposito: se usa en el momento o no se usa. */
const TTL_MINUTES = 5;

/**
 * Cortesia tras el primer canje.
 *
 * El pase se canjea en una peticion GET, asi que basta con que algo abra el
 * enlace una vez para gastarlo: la previsualizacion del enlace, el prefetch del
 * navegador dentro de Telegram, o el propio usuario tocando primero "Abrir mi
 * portal" y luego "Abrir en el navegador". Con un solo uso estricto, el intento
 * de verdad llegaba con el pase ya quemado y el portal contestaba que el enlace
 * no era valido.
 *
 * Durante esta ventana el mismo pase se admite otra vez. Sigue atado al chat al
 * que se emitio y sigue caducando con `expires_at`, asi que lo que se amplia es
 * el margen para abrirlo, no la vida del enlace.
 */
const GRACE_SECONDS = 120;

/**
 * Puertos que los navegadores se niegan a abrir por estar reservados a otros
 * protocolos. Es la lista que comparten Chrome y Firefox.
 */
const PUERTOS_BLOQUEADOS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080,
]);

/**
 * Hosts que significan "escucha en todas las interfaces" y no son un destino al
 * que se pueda navegar. Sirven para configurar por donde escucha un servidor,
 * nunca para construir un enlace.
 */
const HOSTS_NO_NAVEGABLES = new Set(['0.0.0.0', '::', '[::]', '0']);

/**
 * Hosts que si son navegables, pero solo desde la propia maquina. Estos enlaces
 * viajan por Telegram al telefono de otra persona, donde `localhost` es su
 * propio dispositivo, asi que el portal aparece como "no se puede abrir".
 */
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Rutas a las que se permite redirigir tras canjear el pase. Solo destinos
 * internos: con la sesion recien abierta, un salto a un sitio ajeno seria un
 * regalo para quien pudiera influir en el destino.
 *
 * Se admite una cadena de consulta sencilla para poder aterrizar en una seccion
 * concreta --las fotos de la semana, un servicio en curso-- sin inventar una
 * ruta por pestaña. El alfabeto es deliberadamente estrecho: sin `/`, sin `:`
 * y sin `.`, no hay forma de colar un `//host` ni un esquema y salir del sitio.
 */
const ALLOWED_REDIRECT =
  /^\/(admin|jefe|empleada|chofer)(\/[\w\-/]*)?(\?[\w\-=&]*)?$/;

/**
 * Huella del pase. SHA-256 y no bcrypt porque el canje busca por indice, y con
 * 32 bytes aleatorios la fuerza bruta no es la amenaza: lo que evita el hash es
 * que un volcado de la tabla sea directamente utilizable.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class PanelAccessService {
  private readonly logger = new Logger(PanelAccessService.name);

  constructor(
    @InjectRepository(PanelAccessToken)
    private readonly tokens: Repository<PanelAccessToken>,
    @InjectRepository(Usuarios)
    private readonly usuarios: Repository<Usuarios>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Emite un pase y devuelve el enlace que se le manda al chat.
   *
   * El destino se guarda aqui y no en la URL para que nadie pueda cambiarlo
   * editando el enlace antes de abrirlo.
   */
  async issueLink(
    userId: string,
    chatId: string | null,
    redirectPath?: string | null,
  ): Promise<{ url: string; expiresAt: Date }> {
    const user = await this.usuarios.findOne({ where: { id: userId } });
    if (!user || !user.activo) {
      throw new UnauthorizedException('Usuario no habilitado');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000);

    await this.tokens.save(
      this.tokens.create({
        userId,
        tokenHash: hashToken(token),
        chatId: chatId ?? null,
        redirectPath: this.safeRedirect(redirectPath),
        expiresAt,
      }),
    );

    return { url: `${this.baseUrl()}/acceso/${token}`, expiresAt };
  }

  /**
   * Canjea el pase. Devuelve el usuario y a donde llevarlo.
   *
   * El marcado va en un UPDATE condicional, no en un `find` seguido de un
   * `save`: dos aperturas simultaneas del mismo enlace -- la de la
   * previsualizacion de Telegram y la del dedo del jefe -- llegarian a la vez y
   * las dos veria el pase sin usar.
   *
   * Ese UPDATE resolvia el empate, pero dejaba fuera al segundo: quien abria el
   * enlace por segunda vez, aunque fuera el mismo usuario un segundo despues,
   * recibia "el enlace ya se uso". Por eso el pase se admite durante
   * `GRACE_SECONDS` a partir del primer canje.
   */
  async consume(
    token: string,
    chatId?: string | null,
  ): Promise<{ user: Usuarios; redirectPath: string | null }> {
    const rechazo = new UnauthorizedException(
      'El enlace de acceso no es válido o ya se usó',
    );

    if (!token || token.length > 200) throw rechazo;

    /*
     * En Postgres, TypeORM devuelve `[filas, afectadas]` para UPDATE y DELETE,
     * y solo las filas para el resto. Leer `result[0]` como si fuera la fila
     * daba el array entero: los campos salian undefined y un pase ya usado
     * -- array vacio, que es truthy -- se colaba hasta reventar contra la
     * base en vez de rechazarse limpiamente.
     *
     * `used_at` se fija con COALESCE para que la ventana de cortesia se mida
     * desde el primer canje y no se renueve con cada reintento: si no, cada
     * reapertura correria la ventana hacia adelante y el pase valdria
     * indefinidamente mientras alguien lo siguiera abriendo.
     */
    const result = await this.tokens.query(
      `UPDATE public.panel_access_tokens
          SET used_at = COALESCE(used_at, now())
        WHERE token_hash = $1
          AND expires_at > now()
          AND (used_at IS NULL OR used_at > now() - $2::interval)
      RETURNING user_id AS "userId", chat_id AS "chatId",
                redirect_path AS "redirectPath"`,
      [hashToken(token), `${GRACE_SECONDS} seconds`],
    );

    const filas: Array<{
      userId?: string;
      chatId?: string | null;
      redirectPath?: string | null;
    }> = Array.isArray(result?.[0]) ? result[0] : (result ?? []);

    const row = filas[0];
    if (!row?.userId) throw rechazo;

    // Un mensaje reenviado no debe servirle a otro chat.
    if (row.chatId && chatId && row.chatId !== chatId) throw rechazo;

    const user = await this.usuarios.findOne({ where: { id: row.userId } });
    if (!user || !user.activo) throw rechazo;

    return { user, redirectPath: row.redirectPath ?? null };
  }

  /** Limpia pases caducados. El historial de accesos no aporta nada aqui. */
  async purgeExpired(): Promise<number> {
    const { affected } = await this.tokens.delete({
      expiresAt: LessThan(new Date(Date.now() - 24 * 60 * 60_000)),
    });
    if (affected) {
      this.logger.log(`Pases de acceso caducados eliminados: ${affected}`);
    }
    return affected ?? 0;
  }

  /**
   * Origen del panel, normalizado.
   *
   * Se miran las tres variables que usa el proyecto porque conviven: el
   * despliegue configura `WEB_URL`, que era la que leian los portales de
   * Telegram, y `PANEL_BASE_URL` se admite para poder apuntar el panel a otro
   * host sin mover el resto.
   *
   * El valor puede venir sin esquema —en el entorno real esta como
   * `rvcs-pruebas.com.mx`— y sin el no es una URL valida. Se completa con https
   * y no con http porque Telegram rechaza los botones de Mini App que no sean
   * https, y porque el panel siempre se sirve cifrado.
   */
  private baseUrl(): string {
    const configurado =
      this.configService.get<string>('PANEL_BASE_URL') ??
      this.configService.get<string>('WEB_URL') ??
      this.configService.get<string>('FRONTEND_URL');

    if (!configurado?.trim()) {
      this.logger.warn(
        'Sin PANEL_BASE_URL, WEB_URL ni FRONTEND_URL: los enlaces de acceso apuntaran a localhost.',
      );
      return 'http://localhost:3000';
    }

    const limpio = configurado.trim().replace(/\/+$/, '');
    const url = /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`;
    this.avisarSiElOrigenNoEsNavegable(url);
    return url;
  }

  /**
   * Avisa si el origen configurado no sirve como destino en un navegador.
   *
   * Desde el backend un enlace mal configurado se ve perfectamente formado: se
   * arma sin error y se manda sin queja. El fallo solo aparece en el navegador
   * de quien lo abre, y no deja rastro en ningun log. De ahi que valga la pena
   * gritarlo aqui, con el nombre de la variable que hay que corregir.
   */
  private avisarSiElOrigenNoEsNavegable(url: string): void {
    let host: string;
    let puerto: string;
    try {
      const parsed = new URL(url);
      host = parsed.hostname;
      puerto = parsed.port;
    } catch {
      this.logger.error(
        `El origen del panel no es una URL valida: "${url}". Revisa PANEL_BASE_URL o WEB_URL.`,
      );
      return;
    }

    /*
     * `0.0.0.0` es la direccion con la que un servidor dice "escucho en todas
     * mis interfaces". Como destino no significa nada: el navegador no tiene a
     * donde ir. Se cuela con facilidad porque es lo que se pone para que el
     * proceso acepte conexiones desde fuera -- el contenedor del panel arranca
     * con HOSTNAME=0.0.0.0 -- y de ahi acaba copiada en la variable del enlace.
     */
    if (HOSTS_NO_NAVEGABLES.has(host)) {
      this.logger.error(
        `El origen del panel apunta a "${host}", que es una direccion de escucha ` +
          'y no un destino: el enlace que reciba el personal no abrira en ningun ' +
          'navegador. Pon en PANEL_BASE_URL (o WEB_URL) el dominio publico por el ' +
          'que se entra al panel, no la direccion en la que escucha el proceso.',
      );
      return;
    }

    /*
     * Caso distinto al anterior y con remedio propio: la direccion si es
     * navegable, pero solo desde la maquina que sirve el panel. Se cuela al
     * desplegar con Compose sin definir DOCKER_WEB_URL en el .env de la raiz,
     * porque el bloque `environment` de compose gana sobre backend/.env y cae
     * al valor por defecto `http://localhost:3001`.
     */
    if (HOSTS_LOCALES.has(host.toLowerCase())) {
      this.logger.error(
        `El origen del panel es "${url}", una direccion local: en el telefono de ` +
          'quien abra el enlace apunta a su propio dispositivo y el portal fallara ' +
          'con "no se puede abrir". Si despliegas con Docker Compose, define ' +
          'DOCKER_WEB_URL en el .env de la raiz: el bloque environment de compose ' +
          'ignora el WEB_URL de backend/.env.',
      );
      return;
    }

    if (!puerto) return;

    /*
     * Chrome y Firefox rechazan la peticion antes de hacerla, con un "no tienes
     * permisos para usar el puerto de red restringido" que no menciona ni el
     * puerto ni la configuracion.
     */
    if (PUERTOS_BLOQUEADOS.has(Number(puerto))) {
      this.logger.error(
        `El origen del panel usa el puerto ${puerto}, que los navegadores bloquean: ` +
          'el portal fallara con "puerto de red restringido" sin llegar al servidor. ' +
          'Sirve el panel en otro puerto (o detras de 443) y actualiza PANEL_BASE_URL o WEB_URL.',
      );
    }
  }

  /**
   * Solo se admiten rutas internas del panel. Sin esto, quien pudiera influir
   * en el destino convertiria el enlace en un salto a un sitio ajeno con la
   * sesion recien abierta.
   */
  private safeRedirect(path?: string | null): string | null {
    if (!path) return null;
    const limpio = path.trim();
    return ALLOWED_REDIRECT.test(limpio) ? limpio : null;
  }
}
