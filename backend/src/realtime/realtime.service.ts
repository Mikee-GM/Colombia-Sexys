import { Injectable, Logger, MessageEvent, OnModuleInit } from '@nestjs/common';
import { merge, Observable, Subject, timer } from 'rxjs';
import { map } from 'rxjs/operators';
import { RealtimeBus, RealtimeMessage } from './realtime.bus';

/**
 * Un canal SSE vivo mas su contador de suscriptores. El contador es lo que
 * permite liberar el Subject cuando se va el ultimo cliente: sin el, cada
 * usuario distinto que se conectaba desde el arranque dejaba un Subject
 * residente para siempre y la memoria del proceso solo crecia.
 */
type Channel = {
  subject: Subject<any>;
  subscribers: number;
};

type ChannelRegistry = Map<string, Channel>;

@Injectable()
export class RealtimeEventsService implements OnModuleInit {
  private static readonly HEARTBEAT_INTERVAL_MS = 15_000;

  /** Canal comun de jefes/admin: siempre existe, no se libera. */
  private readonly jefesSubject = new Subject<any>();

  private readonly bossSubjects: ChannelRegistry = new Map();
  private readonly employeeSubjects: ChannelRegistry = new Map();
  private readonly driverSubjects: ChannelRegistry = new Map();
  private readonly clientSubjects: ChannelRegistry = new Map();

  private readonly observadores: ((message: RealtimeMessage) => void)[] = [];

  private readonly logger = new Logger(RealtimeEventsService.name);

  constructor(private readonly bus: RealtimeBus) {}

  onModuleInit(): void {
    // Lo que publica otra replica se entrega aqui igual que si se hubiera
    // originado en esta.
    this.bus.onRemoteMessage((message) => this.deliverLocally(message));
  }

  /**
   * Reparte un evento a los canales de este proceso.
   *
   * Es el unico sitio que escribe en los Subjects, venga el evento de esta
   * replica o de otra, para que las dos rutas se comporten igual.
   */
  private deliverLocally(message: RealtimeMessage): void {
    const { target, key, event } = message;
    switch (target) {
      case 'jefes':
        this.jefesSubject.next(event);
        for (const channel of this.bossSubjects.values())
          channel.subject.next(event);
        return;
      case 'boss':
        if (key) {
          this.emitTo(this.bossSubjects, key, event);
        } else {
          for (const channel of this.bossSubjects.values())
            channel.subject.next(event);
        }
        this.jefesSubject.next(event);
        return;
      case 'employee':
        if (key) this.emitTo(this.employeeSubjects, key, event);
        return;
      case 'driver':
        if (key) this.emitTo(this.driverSubjects, key, event);
        return;
      case 'client':
        if (key) this.emitTo(this.clientSubjects, key, event);
        return;
    }
  }

  /**
   * Entrega en local y publica para las demas replicas.
   *
   * El orden importa: primero lo local, que es inmediato y no depende de la
   * base, y despues la publicacion, que puede fallar sin arrastrar a la
   * entrega que ya ocurrio.
   */
  private dispatch(message: RealtimeMessage): void {
    this.deliverLocally(message);
    void this.bus.publish(message);

    for (const observador of this.observadores) {
      try {
        observador(message);
      } catch (err) {
        // Un observador que falla no puede impedir la entrega en vivo, que es
        // lo que este servicio existe para hacer.
        this.logger.error('Un observador de eventos falló:', err);
      }
    }
  }

  /**
   * Escucha lo que se emite desde ESTA replica.
   *
   * Se engancha aqui y no en `deliverLocally` a proposito: alli tambien entra lo
   * que llega de otras replicas, asi que con dos procesos cada evento se
   * observaria dos veces y saldrian avisos duplicados. `dispatch` solo corre en
   * la replica que origina el evento.
   *
   * Lo usa la fachada de avisos para no tener que sembrar llamadas por todo el
   * codigo: los eventos son donde los cambios de estado ocurren de verdad.
   */
  onLocalDispatch(observador: (message: RealtimeMessage) => void): void {
    this.observadores.push(observador);
  }

  getJefesStream(): Observable<MessageEvent> {
    return this.withHeartbeat(
      this.jefesSubject.asObservable().pipe(map((data) => ({ data }))),
    );
  }

  getBossStream(bossId: string): Observable<MessageEvent> {
    return this.streamFor(this.bossSubjects, bossId);
  }

  getEmployeeStream(empleadaId: string): Observable<MessageEvent> {
    return this.streamFor(this.employeeSubjects, empleadaId);
  }

  getDriverStream(choferId: string): Observable<MessageEvent> {
    return this.streamFor(this.driverSubjects, choferId);
  }

  getClientStream(clienteId: string): Observable<MessageEvent> {
    return this.streamFor(this.clientSubjects, clienteId);
  }

  /**
   * Crea el canal en la primera suscripcion y lo borra del registro cuando se
   * desconecta el ultimo suscriptor.
   */
  private streamFor(
    registry: ChannelRegistry,
    key: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let channel = registry.get(key);
      if (!channel) {
        channel = { subject: new Subject<any>(), subscribers: 0 };
        registry.set(key, channel);
      }
      channel.subscribers += 1;

      const inner = this.withHeartbeat(
        channel.subject.asObservable().pipe(map((data) => ({ data }))),
      ).subscribe(subscriber);

      return () => {
        inner.unsubscribe();
        const current = registry.get(key);
        if (!current) return;
        current.subscribers -= 1;
        if (current.subscribers <= 0) {
          current.subject.complete();
          registry.delete(key);
        }
      };
    });
  }

  private emitTo(registry: ChannelRegistry, key: string, event: any) {
    registry.get(key)?.subject.next(event);
  }

  private withHeartbeat(
    events: Observable<MessageEvent>,
  ): Observable<MessageEvent> {
    const heartbeat = timer(
      0,
      RealtimeEventsService.HEARTBEAT_INTERVAL_MS,
    ).pipe(
      map(() => ({
        data: { type: 'heartbeat', timestamp: new Date().toISOString() },
      })),
    );
    return merge(events, heartbeat);
  }

  emitToJefes(event: any) {
    this.dispatch({ target: 'jefes', key: null, event });
  }

  emitToBoss(bossId: string | null | undefined, event: any) {
    this.dispatch({ target: 'boss', key: bossId ?? null, event });
  }

  emitToBosses(bossIds: (string | null | undefined)[], event: any) {
    const uniqueIds = Array.from(
      new Set(bossIds.filter((id): id is string => Boolean(id))),
    );
    if (uniqueIds.length === 0) {
      this.emitToJefes(event);
      return;
    }
    for (const id of uniqueIds) {
      this.dispatch({ target: 'boss', key: id, event });
    }
  }

  emitToEmployee(empleadaId: string, event: any) {
    this.dispatch({ target: 'employee', key: empleadaId, event });
  }

  emitToDriver(choferId: string, event: any) {
    this.dispatch({ target: 'driver', key: choferId, event });
  }

  emitToClient(clienteId: string, event: any) {
    this.dispatch({ target: 'client', key: clienteId, event });
  }
}
