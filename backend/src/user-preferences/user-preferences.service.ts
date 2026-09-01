import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreference } from './entities/user-preference.entity';

/** Claves que el sistema reconoce. Una clave libre convertiria la tabla en un basurero. */
// `avisos` guarda que tipos de aviso push quiere recibir esta persona:
// `{ [tipo]: false }` apaga uno. Lo que no aparece se manda.
export const PREFERENCE_KEYS = ['dashboard_layout', 'avisos'] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

/**
 * Tope del contenido de un ajuste.
 *
 * Es una preferencia de pantalla, no un almacen: sin limite, un cliente
 * manipulado podria dejar megabytes por usuario en una tabla que se lee en cada
 * carga del panel.
 */
const MAX_VALUE_BYTES = 16 * 1024;

@Injectable()
export class UserPreferencesService {
  constructor(
    @InjectRepository(UserPreference)
    private readonly preferences: Repository<UserPreference>,
  ) {}

  assertKnownKey(key: string): asserts key is PreferenceKey {
    if (!PREFERENCE_KEYS.includes(key as PreferenceKey)) {
      throw new BadRequestException(`Ajuste desconocido: ${key}`);
    }
  }

  /**
   * Devuelve el ajuste, o null si el usuario nunca lo guardo.
   *
   * El nulo es informacion: significa "usa el orden por defecto", que no es lo
   * mismo que un tablero guardado con todo oculto.
   */
  async get(
    userId: string,
    key: string,
  ): Promise<Record<string, unknown> | null> {
    this.assertKnownKey(key);
    const fila = await this.preferences.findOneBy({ userId, key });
    return fila?.value ?? null;
  }

  async set(
    userId: string,
    key: string,
    value: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.assertKnownKey(key);

    if (Buffer.byteLength(JSON.stringify(value ?? {})) > MAX_VALUE_BYTES) {
      throw new BadRequestException('El ajuste es demasiado grande');
    }

    /*
     * Upsert directo: la clave primaria es el par usuario+clave, asi que no
     * hace falta leer antes de escribir. Va en SQL crudo porque el `value` es
     * un jsonb sin forma fija y el `upsert` de TypeORM exige una entidad
     * parcial tipada, que aqui no aporta nada.
     */
    await this.preferences.query(
      `INSERT INTO user_preferences (user_id, key, value, updated_at)
            VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (user_id, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [userId, key, JSON.stringify(value ?? {})],
    );

    return value ?? {};
  }

  /** Vuelve al valor por defecto borrando la fila, no guardando un vacio. */
  async reset(userId: string, key: string): Promise<void> {
    this.assertKnownKey(key);
    await this.preferences.delete({ userId, key });
  }
}
