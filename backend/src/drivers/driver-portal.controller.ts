import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { DriverTripsService } from './driver-trips.service';
import { PortalAuthGuard } from '../auth/guards/portal-auth.guard';
import { PortalUser } from '../auth/decorators/portal-user.decorator';
import { ApiControllerDocs } from '../common/swagger/api-docs.decorators';

@Controller('driver-portal')
@ApiControllerDocs('driver-portal')
@UseGuards(PortalAuthGuard)
export class DriverPortalController {
  constructor(
    private readonly driversService: DriversService,
    private readonly driverTripsService: DriverTripsService,
  ) {}

  @Get('me')
  getMyPortal(@PortalUser() userId: string) {
    return this.driversService.getDriverPortalData(userId);
  }

  /**
   * Toma una oferta de viaje.
   *
   * La misma oferta se manda a varios choferes, asi que puede perderse la
   * carrera. Eso no es un error del que avisar con un fallo: se responde que
   * ya no esta disponible, que es lo que ha pasado.
   */
  @Post('trips/:tripId/accept')
  @HttpCode(200)
  async aceptarOferta(
    @PortalUser() userId: string,
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
  ) {
    const choferId = await this.driverTripsService.choferDeUsuario(userId);
    const { aceptado } = await this.driverTripsService.aceptarOferta(
      tripId,
      choferId,
    );
    return {
      aceptado,
      mensaje: aceptado
        ? 'Viaje asignado.'
        : 'Otro chofer tomó este viaje primero.',
    };
  }

  /** Deja pasar una oferta, que se reofrece al siguiente chofer. */
  @Post('trips/:tripId/reject')
  @HttpCode(200)
  async rechazarOferta(
    @PortalUser() userId: string,
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
  ) {
    const choferId = await this.driverTripsService.choferDeUsuario(userId);
    await this.driverTripsService.rechazarOferta(tripId, choferId);
    return { rechazado: true };
  }

  /**
   * Marca que ya llego al punto de recogida.
   *
   * Hasta ahora esto solo existia en el chat del bot, donde el chofer tenia
   * que encontrar el mensaje correcto entre todo lo demas justo cuando va
   * conduciendo. Los botones del chat siguen valiendo: los dos caminos llaman
   * al mismo servicio, asi que no pueden divergir.
   */
  @Post('trips/:tripId/arrived')
  @HttpCode(200)
  async marcarLlegada(
    @PortalUser() userId: string,
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
  ) {
    const choferId = await this.driverTripsService.choferDeUsuario(userId);
    const viaje = await this.driverTripsService.marcarLlegada(tripId, choferId);
    return { estado: viaje.estado };
  }

  /**
   * Marca que la empleada ya subio al coche y arranca el trayecto.
   *
   * Cancela su margen de espera, asi que no es un boton inocente: se toca
   * cuando de verdad va a bordo.
   */
  @Post('trips/:tripId/picked-up')
  @HttpCode(200)
  async marcarRecogida(
    @PortalUser() userId: string,
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
  ) {
    const choferId = await this.driverTripsService.choferDeUsuario(userId);
    const viaje = await this.driverTripsService.marcarRecogida(
      tripId,
      choferId,
    );
    return { estado: viaje.estado };
  }

  /**
   * Cierra el viaje.
   *
   * Es la accion con mas cola: libera al chofer, mueve el servicio segun el
   * tramo y, en el regreso, decide el estado de liquidacion y dispara el
   * recibo final al cliente.
   */
  @Post('trips/:tripId/finished')
  @HttpCode(200)
  async finalizar(
    @PortalUser() userId: string,
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
  ) {
    const choferId = await this.driverTripsService.choferDeUsuario(userId);
    const viaje = await this.driverTripsService.finalizarViaje(
      tripId,
      choferId,
    );
    return { estado: viaje.estado };
  }
}
