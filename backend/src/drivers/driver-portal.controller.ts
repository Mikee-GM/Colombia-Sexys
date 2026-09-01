import {
  Body,
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
import { DisciplineService } from '../discipline/discipline.service';
import { CreateRatingDto } from '../discipline/dto/discipline.dto';
import { PortalAuthGuard } from '../auth/guards/portal-auth.guard';
import { PortalUser } from '../auth/decorators/portal-user.decorator';
import { LocationsService } from '../locations/locations.service';
import { RegistrarUbicacionDto } from '../locations/dto/registrar-ubicacion.dto';
import { ApiControllerDocs } from '../common/swagger/api-docs.decorators';

@Controller('driver-portal')
@ApiControllerDocs('driver-portal')
@UseGuards(PortalAuthGuard)
export class DriverPortalController {
  constructor(
    private readonly driversService: DriversService,
    private readonly driverTripsService: DriverTripsService,
    private readonly disciplineService: DisciplineService,
    private readonly locationsService: LocationsService,
  ) {}

  /**
   * Donde esta ahora mismo.
   *
   * Hasta ahora la unica via era compartir ubicacion en vivo desde Telegram, y
   * dependia de acordarse de hacerlo. El portal la manda solo mientras esta
   * abierto, que es justo cuando la persona esta trabajando.
   *
   * La espera entre escrituras la aplica el servicio, asi que un navegador que
   * mande de mas no castiga a la base.
   */
  @Post('location')
  @HttpCode(200)
  async registrarUbicacion(
    @PortalUser() userId: string,
    @Body() dto: RegistrarUbicacionDto,
  ) {
    return this.locationsService.registrar(userId, dto.lat, dto.lng);
  }

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

  /**
   * Califica a la empleada del viaje.
   *
   * En el chat, una calificacion baja abre una conversacion aparte para pedir
   * el motivo; aqui el formulario recoge las dos cosas de una vez. El DTO ya
   * exige el comentario con una o dos estrellas, asi que la regla no se
   * duplica.
   *
   * La direccion se fija aqui y no se acepta del cuerpo: un chofer solo puede
   * calificar en esa direccion.
   */
  @Post('ratings')
  @HttpCode(201)
  async calificar(@PortalUser() userId: string, @Body() dto: CreateRatingDto) {
    return this.disciplineService.createRating(
      { id: userId, rol: 'chofer' },
      { ...dto, direction: 'driver_to_employee' },
    );
  }
}
