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
}
