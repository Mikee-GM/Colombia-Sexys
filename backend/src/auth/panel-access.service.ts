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

    const result: PanelAccessToken[] = await this.tokens.query(
      `UPDATE public.panel_access_tokens
          SET used_at = now()
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > now()
      RETURNING user_id AS "userId", chat_id AS "chatId",
                redirect_path AS "redirectPath"`,
      [hashToken(token)],
    );

    const row = result?.[0];
    if (!row) throw rechazo;

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
    return /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`;
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
