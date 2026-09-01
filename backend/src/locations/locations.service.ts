import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Choferes } from '../drivers/entities/driver.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { RealtimeEventsService } from '../realtime/realtime.service';

/** Lo ultimo que se guardo de alguien, para no escribir en cada latido. */
type UltimaUbicacion = {
  rol: 'chofer' | 'empleada';
  id: string;
  lat: number;
  lng: number;
  guardadoEn: number;
};

/**
 * Cada cuanto se escribe como mucho, y cuanto hay que moverse para escribir
 * antes de que pase ese rato.
 *
 * Son los mismos numeros que ya usaba el flujo de Telegram, a proposito: las
 * dos vias escriben las mismas columnas y alimentan el mismo mapa, asi que si
 * se comportaran distinto la posicion de alguien dependeria de por donde la
 * mando.
 */
const MINIMO_ENTRE_ESCRITURAS_MS = 60 * 1000;
const METROS_QUE_SALTAN_LA_ESPERA = 50;

/**
 * Donde estan las modelos y los choferes.
 *
 * Existe porque hasta ahora la unica forma de mandar la posicion era compartir
 * ubicacion en vivo desde Telegram: si alguien tenia el chat silenciado, o
 * simplemente no se acordaba, el mapa del jefe se quedaba con la ultima
 * posicion escrita a mano y el reparto por cercania elegia sobre datos viejos.
 * Los portales ya son aplicaciones instaladas en el telefono, asi que pueden
 * mandarla ellos.
 *
 * No sustituye al camino de Telegram: escribe las mismas columnas y emite los
 * mismos eventos, asi que las dos vias se pueden usar a la vez.
 */
@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  /*
   * Cache por usuario. Es local a la replica y se puede perder sin consecuencia:
   * lo peor que pasa es una escritura de mas. Por eso no vive en Redis ni en la
   * base, que serian mas caros que el problema que resuelven.
   */
  private readonly ultimas = new Map<string, UltimaUbicacion>();

  constructor(
    @InjectRepository(Choferes)
    private readonly choferes: Repository<Choferes>,
    @InjectRepository(Empleadas)
    private readonly empleadas: Repository<Empleadas>,
    private readonly realtime: RealtimeEventsService,
  ) {}

  /**
   * Anota donde esta quien manda la peticion.
   *
   * Devuelve si llego a escribirse en base: quien llama puede querer saber que
   * su latido no hizo nada, y sobre todo hace visible en las pruebas que la
   * espera entre escrituras funciona.
   */
  async registrar(
    usuarioId: string,
    lat: number,
    lng: number,
  ): Promise<{ guardada: boolean }> {
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      throw new BadRequestException('Coordenadas fuera de rango');
    }

    const ahora = Date.now();
    const previa = this.ultimas.get(usuarioId);

    if (previa) {
      const desdeLaUltima = ahora - previa.guardadoEn;
      const metros = this.metrosEntre(previa.lat, previa.lng, lat, lng);
      /*
       * Un telefono quieto manda su posicion cada pocos segundos. Sin esta
       * espera, cada modelo en jornada seria un UPDATE por segundo sobre una
       * fila que ademas se lee en el reparto por cercania.
       */
      if (
        desdeLaUltima < MINIMO_ENTRE_ESCRITURAS_MS &&
        metros < METROS_QUE_SALTAN_LA_ESPERA
      ) {
        return { guardada: false };
      }
      await this.escribir(previa.rol, previa.id, lat, lng);
      this.ultimas.set(usuarioId, { ...previa, lat, lng, guardadoEn: ahora });
      return { guardada: true };
    }

    const sujeto = await this.sujetoDe(usuarioId);
    if (!sujeto) {
      // Un jefe o un admin con el portal abierto no tiene donde anotarse. No es
      // un error suyo: simplemente no hay nada que guardar.
      return { guardada: false };
    }

    await this.escribir(sujeto.rol, sujeto.id, lat, lng);
    this.ultimas.set(usuarioId, { ...sujeto, lat, lng, guardadoEn: ahora });
    return { guardada: true };
  }

  /** Quien es esta persona en el mapa: una modelo, un chofer, o nadie. */
  private async sujetoDe(
    usuarioId: string,
  ): Promise<{ rol: 'chofer' | 'empleada'; id: string } | null> {
    const chofer = await this.choferes.findOne({
      where: { usuarioId },
      select: { id: true },
    });
    if (chofer) return { rol: 'chofer', id: chofer.id };

    const empleada = await this.empleadas.findOne({
      where: { usuarioId },
      select: { id: true },
    });
    if (empleada) return { rol: 'empleada', id: empleada.id };

    return null;
  }

  /**
   * Guarda la posicion y la publica en el mapa del jefe.
   *
   * El evento sale con el mismo nombre que emite el camino de Telegram, que es
   * lo que hace que el mapa no tenga que saber por donde llego la posicion.
   */
  private async escribir(
    rol: 'chofer' | 'empleada',
    id: string,
    lat: number,
    lng: number,
  ): Promise<void> {
    const campos = {
      ubicacionLat: lat,
      ubicacionLng: lng,
      ultimaUbicacionAt: new Date(),
    };

    if (rol === 'chofer') {
      await this.choferes.update(id, campos);
      this.realtime.emitToJefes({
        type: 'DRIVER_LOCATION_UPDATE',
        choferId: id,
        lat,
        lng,
      });
      return;
    }

    await this.empleadas.update(id, campos);
    this.realtime.emitToJefes({
      type: 'EMPLOYEE_LOCATION_UPDATE',
      empleadaId: id,
      lat,
      lng,
    });
  }

  /**
   * Distancia en metros entre dos puntos.
   *
   * Aqui si se calcula en memoria, en contra de la costumbre de la casa de
   * dejar los agregados a la base: solo sirve para decidir si merece la pena
   * escribir, asi que consultar a PostgreSQL para averiguar si hay que
   * consultar a PostgreSQL no tendria sentido.
   */
  private metrosEntre(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const RADIO_TIERRA_M = 6371000;
    const aRadianes = (grados: number) => (grados * Math.PI) / 180;

    const dLat = aRadianes(lat2 - lat1);
    const dLng = aRadianes(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(aRadianes(lat1)) *
        Math.cos(aRadianes(lat2)) *
        Math.sin(dLng / 2) ** 2;
    return RADIO_TIERRA_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
