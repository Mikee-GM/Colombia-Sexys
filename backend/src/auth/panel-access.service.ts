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
 * Rutas a las que se permite redirigir tras canjear el pase. Solo destinos
 * internos: con la sesion recien abierta, un salto a un sitio ajeno seria un
 * regalo para quien pudiera influir en el destino.
 */
const ALLOWED_REDIRECT = /^\/(admin|jefe|empleada|chofer)(\/[\w\-/]*)?$/;

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
   * El marcado como usado va en un UPDATE condicional, no en un `find` seguido
   * de un `save`: dos aperturas simultaneas del mismo enlace -- la de la
   * previsualizacion de Telegram y la del dedo del jefe -- llegarian a la vez y
   * las dos veria el pase sin usar.
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
     */
    const result = await this.tokens.query(
      `UPDATE public.panel_access_tokens
          SET used_at = now()
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > now()
      RETURNING user_id AS "userId", chat_id AS "chatId",
                redirect_path AS "redirectPath"`,
      [hashToken(token)],
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
    this.avisarSiElPuertoEstaBloqueado(url);
    return url;
  }

  /**
   * Avisa si el origen usa un puerto que los navegadores se niegan a abrir.
   *
   * Chrome y Firefox tienen una lista de puertos reservados a otros protocolos
   * y rechazan la peticion antes de hacerla, con un "no tienes permisos para
   * usar el puerto de red restringido" que no menciona ni el puerto ni la
   * configuracion. Desde el backend el enlace se ve perfectamente formado, asi
   * que sin este aviso el fallo solo se manifiesta en el navegador de quien
   * abre el portal y no deja rastro en ningun log.
   */
  private avisarSiElPuertoEstaBloqueado(url: string): void {
    let puerto: string;
    try {
      puerto = new URL(url).port;
    } catch {
      this.logger.error(
        `El origen del panel no es una URL valida: "${url}". Revisa PANEL_BASE_URL o WEB_URL.`,
      );
      return;
    }
    if (!puerto) return;

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
