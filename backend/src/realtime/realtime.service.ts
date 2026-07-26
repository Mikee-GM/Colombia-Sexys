import { Injectable, MessageEvent } from '@nestjs/common';
import { merge, Observable, Subject, timer } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class RealtimeEventsService {
  private static readonly HEARTBEAT_INTERVAL_MS = 15_000;
  private readonly jefesSubject = new Subject<any>();
  private readonly bossSubjects = new Map<string, Subject<any>>();
  private readonly employeeSubjects = new Map<string, Subject<any>>();
  private readonly driverSubjects = new Map<string, Subject<any>>();
  private readonly clientSubjects = new Map<string, Subject<any>>();

  getJefesStream(): Observable<MessageEvent> {
    return this.withHeartbeat(
      this.jefesSubject.asObservable().pipe(map((data) => ({ data }))),
    );
  }

  getBossStream(bossId: string): Observable<MessageEvent> {
    if (!this.bossSubjects.has(bossId)) {
      this.bossSubjects.set(bossId, new Subject<any>());
    }
    return this.withHeartbeat(
      this.bossSubjects
        .get(bossId)!
        .asObservable()
        .pipe(map((data) => ({ data }))),
    );
  }

  getEmployeeStream(empleadaId: string): Observable<MessageEvent> {
    if (!this.employeeSubjects.has(empleadaId)) {
      this.employeeSubjects.set(empleadaId, new Subject<any>());
    }
    return this.withHeartbeat(
      this.employeeSubjects
        .get(empleadaId)!
        .asObservable()
        .pipe(map((data) => ({ data }))),
    );
  }

  getDriverStream(choferId: string): Observable<MessageEvent> {
    if (!this.driverSubjects.has(choferId)) {
      this.driverSubjects.set(choferId, new Subject<any>());
    }
    return this.withHeartbeat(
      this.driverSubjects
        .get(choferId)!
        .asObservable()
        .pipe(map((data) => ({ data }))),
    );
  }

  getClientStream(clienteId: string): Observable<MessageEvent> {
    if (!this.clientSubjects.has(clienteId)) {
      this.clientSubjects.set(clienteId, new Subject<any>());
    }
    return this.withHeartbeat(
      this.clientSubjects
        .get(clienteId)!
        .asObservable()
        .pipe(map((data) => ({ data }))),
    );
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
    this.jefesSubject.next(event);
    for (const subject of this.bossSubjects.values()) {
      subject.next(event);
    }
  }

  emitToBoss(bossId: string | null | undefined, event: any) {
    if (bossId) {
      this.bossSubjects.get(bossId)?.next(event);
    } else {
      for (const subject of this.bossSubjects.values()) {
        subject.next(event);
      }
    }
    this.jefesSubject.next(event);
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
      this.bossSubjects.get(id)?.next(event);
    }
    this.jefesSubject.next(event);
  }

  emitToEmployee(empleadaId: string, event: any) {
    const subject = this.employeeSubjects.get(empleadaId);
    if (subject) {
      subject.next(event);
    }
  }

  emitToDriver(choferId: string, event: any) {
    const subject = this.driverSubjects.get(choferId);
    if (subject) {
      subject.next(event);
    }
  }

  emitToClient(clienteId: string, event: any) {
    this.clientSubjects.get(clienteId)?.next(event);
  }
}
