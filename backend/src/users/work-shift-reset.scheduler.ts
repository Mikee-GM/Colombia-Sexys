import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ADVISORY_LOCKS,
  withAdvisoryLock,
} from '../common/scheduling/advisory-lock';
import { APP_TIME_ZONE } from '../common/locale';

/** Se revisa cada quince minutos; el corte real lo decide la fecha, no el reloj. */
const INTERVALO_MS = 15 * 60 * 1000;

/** Primer barrido poco despues de arrancar, sin competir con el arranque. */
const RETRASO_INICIAL_MS = 90_000;

/**
 * Devuelve a todo el mundo a su jornada al empezar el dia.
 *
 * `en_jornada` decia "sigue trabajando hoy", pero nada lo devolvia a true: solo
 * cambiaba cuando la persona pulsaba el boton. Como el reparto de servicios y
 * de viajes exige `en_jornada = true`, quien cerraba su dia una vez quedaba
 * fuera para siempre, y el sintoma era el peor posible: al jefe le aparecia que
 * no hay choferes disponibles, sin ninguna pista de por que.
 *
 * Un estado con "hoy" en su significado necesita que alguien pase la hoja. Eso
 * hace esto: a partir de la medianoche local, quien cerro su jornada en un dia
 * anterior vuelve a estar dentro. A quien la cerro hoy no se le toca, porque su
 * decision sigue siendo de hoy.
 */
@Injectable()
export class WorkShiftResetScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkShiftResetScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runCycle(), INTERVALO_MS);
    if (typeof this.timer?.unref === 'function') this.timer.unref();

    const inicial = setTimeout(() => void this.runCycle(), RETRASO_INICIAL_MS);
    if (typeof inicial?.unref === 'function') inicial.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await withAdvisoryLock(
        this.dataSource,
        ADVISORY_LOCKS.workShiftReset,
        () => this.reabrirJornadas(),
      );
    } catch (error) {
      this.logger.error('Error en WorkShiftResetScheduler:', error);
    } finally {
      this.running = false;
    }
  }

  private async reabrirJornadas(): Promise<void> {
    /*
     * La comparacion es por FECHA en la zona horaria de la operacion, no por
     * una ventana de horas: lo que define un dia nuevo es que haya cambiado el
     * dia del calendario donde se trabaja, no que hayan pasado 24 horas desde
     * que la persona cerro.
     *
     * `jornada_actualizada_at IS NULL` cubre a quien nunca ha tocado el boton y
     * quedo en false por cualquier via.
     */
    const resultado: unknown = await this.dataSource.query(
      `UPDATE usuarios
          SET en_jornada = true
        WHERE en_jornada = false
          AND activo = true
          AND (
            jornada_actualizada_at IS NULL
            OR (jornada_actualizada_at AT TIME ZONE $1)::date
               < (now() AT TIME ZONE $1)::date
          )
        RETURNING id`,
      [APP_TIME_ZONE],
    );

    /*
     * El driver de Postgres devuelve las filas de `RETURNING` directamente,
     * no la tupla `[filas, conteo]` de otros motores. Se contemplan las dos
     * formas para que el recuento no dependa de ese detalle del driver.
     */
    const filas = Array.isArray(resultado)
      ? Array.isArray(resultado[0])
        ? (resultado[0] as unknown[])
        : resultado
      : [];
    const reabiertas = filas.length;
    if (reabiertas > 0) {
      this.logger.log(
        `Nuevo dia: ${reabiertas} persona(s) vuelven a estar dentro de su jornada.`,
      );
    }
  }
}
