import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { EmployeesService } from './employees.service';
import { WeeklyContentService } from '../weekly-content/weekly-content.service';
import { ServicesService } from '../services/services.service';
import { UpdatePortalTripStatusDto } from './dto/portal-trip-status.dto';
import { AddPortalServiceExtraDto } from './dto/portal-service-extra.dto';
import { PortalAuthGuard } from '../auth/guards/portal-auth.guard';
import { DisciplineService } from '../discipline/discipline.service';
import { GroupServicesService } from '../group-services/group-services.service';
import {
  AppealRatingDto,
  CreateConductReportDto,
  CreateRatingDto,
} from '../discipline/dto/discipline.dto';
import { ExtendServiceDto } from './dto/extend-service.dto';
import { PortalUser } from '../auth/decorators/portal-user.decorator';
import { LocationsService } from '../locations/locations.service';
import { RegistrarUbicacionDto } from '../locations/dto/registrar-ubicacion.dto';
import { ApiControllerDocs } from '../common/swagger/api-docs.decorators';
import {
  UPLOAD_MAX_BYTES,
  type UploadedFilePayload,
} from '../upload/upload.service';

/** Mismo tope por envio que aplica el servicio, declarado para el interceptor. */
const MAX_ARCHIVOS = 12;

@Controller('employee-portal')
@ApiControllerDocs('employee-portal')
@UseGuards(PortalAuthGuard)
export class EmployeePortalController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly weeklyContentService: WeeklyContentService,
    private readonly servicesService: ServicesService,
    private readonly disciplineService: DisciplineService,
    private readonly groupServicesService: GroupServicesService,
    private readonly locationsService: LocationsService,
  ) {}

  @Get('me')
  getMyPortal(@PortalUser() userId: string) {
    return this.employeesService.getEmployeePortalData(userId);
  }

  /**
   * Avance del viaje: voy en camino y ya llegue.
   *
   * Son las dos acciones del ciclo del servicio que la modelo hacia solo desde
   * el chat, y las dos que mas prisa tienen: el cliente esta esperando y hasta
   * ahora dependian de encontrar el mensaje correcto en Telegram.
   *
   * `updateUberStatus` ya comprueba que quien actualiza sea la empleada del
   * viaje, asi que aqui no se repite la verificacion: hacerlo dos veces invita
   * a que una de las dos se quede atras.
   */
  @Post('trips/:tripId/status')
  @HttpCode(200)
  async updateTripStatus(
    @PortalUser() userId: string,
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @Body() dto: UpdatePortalTripStatusDto,
  ) {
    await this.servicesService.updateUberStatus(
      tripId,
      userId,
      dto.estado === 'llegue' ? 'employee_arrived' : 'employee_en_route',
    );
    return { estado: dto.estado };
  }

  /**
   * Extras que puede agregarle al servicio en curso.
   *
   * En un servicio grupal solo devuelve los del catalogo de quien pregunta: los
   * de otra participante no le corresponde cobrarlos.
   */
  @Get('services/:servicioId/available-extras')
  async getAvailableExtras(
    @PortalUser() userId: string,
    @Param('servicioId', new ParseUUIDPipe()) servicioId: string,
  ) {
    const extras = await this.servicesService.listAvailableExtras(
      servicioId,
      userId,
    );
    return extras.map((extra) => ({
      id: extra.id,
      nombre: extra.nombre,
      precio: Number(extra.precio),
    }));
  }

  /**
   * Agrega un extra al servicio en curso.
   *
   * Es una sola peticion frente a los tres pasos del chat: alli el menu se
   * parte porque no cabe un formulario, aqui la modelo elige extra y metodo de
   * pago a la vez.
   */
  @Post('services/:servicioId/extras')
  @HttpCode(201)
  async addServiceExtra(
    @PortalUser() userId: string,
    @Param('servicioId', new ParseUUIDPipe()) servicioId: string,
    @Body() dto: AddPortalServiceExtraDto,
  ) {
    const resultado = await this.servicesService.addServiceExtra({
      servicioId,
      extraCatalogoId: dto.extraCatalogoId,
      metodoPago: dto.metodoPago,
      actorUserId: userId,
    });

    return {
      agregado: {
        nombre: resultado.extraAgregado.nombre,
        precio: Number(resultado.precioCobrado),
        metodoPago: dto.metodoPago,
      },
      extras: resultado.extras,
      totalExtras: resultado.totalExtras,
      totalServicio: Number(resultado.servicio.totalFinal),
    };
  }

  /**
   * Cierra el servicio en curso.
   *
   * El cierre completo --duracion, redondeo de horas abiertas, liquidacion,
   * servicio encadenado, disponibilidad, aviso al jefe para el regreso-- lo
   * hace `ServicesService.finishByEmployee`, el mismo que usa el boton del
   * chat. Aqui solo se devuelve el resumen que la modelo tiene que ver.
   */
  @Post('services/:servicioId/finish')
  @HttpCode(200)
  async finishMyService(
    @PortalUser() userId: string,
    @Param('servicioId', new ParseUUIDPipe()) servicioId: string,
  ) {
    /*
     * Un grupal lo cierra su responsable y por otro camino: el suyo reparte
     * entre las participantes y cuadra el saldo pendiente. `finishByEmployee`
     * lo rechaza a proposito, asi que hay que preguntar antes de que rebote.
     *
     * Sin esto, la responsable de un grupal se quedaba sin poder cerrarlo desde
     * la aplicacion: el flujo del chat pedia su id de Telegram.
     */
    if (await this.esGrupal(servicioId)) {
      const cerrado = await this.groupServicesService.finishByResponsibleUser(
        servicioId,
        userId,
      );
      return { servicioId, grupal: true, resumen: cerrado };
    }

    const cierre = await this.servicesService.finishByEmployee(
      servicioId,
      userId,
    );

    return {
      servicioId: cierre.servicio.id,
      duracion: cierre.duracionFormatted,
      horasFacturadas: cierre.horasFacturadas,
      totalACobrar: Number(cierre.servicio.totalFinal),
      totalBase: Number(cierre.servicio.totalBase),
      metodoPago: cierre.servicio.metodoPago,
      clienteNombre: cierre.clienteNombre,
      // Con servicio encadenado no hay regreso que cuadrar: sigue trabajando.
      tieneServicioSiguiente: cierre.hasSuccessor,
    };
  }

  /** Si el servicio es grupal, que decide por cual de los dos cierres va. */
  private async esGrupal(servicioId: string): Promise<boolean> {
    const servicio = await this.servicesService.findOne(servicioId);
    return servicio?.serviceType === 'grupal';
  }

  /**
   * Fotos que mando esta semana, con el estado de revision de cada una.
   *
   * Va aparte de `me` porque cambia mucho mas a menudo: tras subir se refresca
   * esto solo, sin volver a recalcular ranking, ganancias y reputacion.
   */
  @Get('weekly-photos')
  async getMyWeeklyPhotos(@PortalUser() userId: string) {
    const empleada = await this.employeesService.findByUserId(userId);
    const [estado, envios] = await Promise.all([
      this.weeklyContentService.getWeeklyStatusForEmployee(empleada.id),
      this.weeklyContentService.getCurrentCycleSubmissions(empleada.id),
    ]);
    return { estado, envios };
  }

  /**
   * Subida de las fotos semanales.
   *
   * Es la unica via desde que se retiro la de Telegram. El tope de tamaño se
   * declara aqui ademas de en el servicio para que un archivo enorme se corte
   * en el interceptor y no despues de haberlo cargado entero en memoria.
   */
  @Post('weekly-photos')
  @UseInterceptors(
    FilesInterceptor('fotos', MAX_ARCHIVOS, {
      limits: { fileSize: UPLOAD_MAX_BYTES, files: MAX_ARCHIVOS },
    }),
  )
  async uploadMyWeeklyPhotos(
    @PortalUser() userId: string,
    @UploadedFiles() fotos: UploadedFilePayload[],
  ) {
    const empleada = await this.employeesService.findByUserId(userId);
    const { subidas } = await this.weeklyContentService.submitPortalPhotos(
      empleada.id,
      fotos ?? [],
    );
    const estado = await this.weeklyContentService.getWeeklyStatusForEmployee(
      empleada.id,
    );
    return { subidas: subidas.length, estado };
  }

  /**
   * Extiende el servicio en curso.
   *
   * En el chat son varios pasos porque no cabe un formulario; aqui elige las
   * horas y se manda en una sola peticion. La comprobacion de que el servicio
   * sea suyo la hace `extendByEmployee`, asi que no se repite: hacerlo dos
   * veces invita a que una de las dos se quede atras.
   */
  @Post('services/:servicioId/extend')
  @HttpCode(200)
  async extenderServicio(
    @PortalUser() userId: string,
    @Param('servicioId', new ParseUUIDPipe()) servicioId: string,
    @Body() dto: ExtendServiceDto,
  ) {
    const servicio = await this.servicesService.extendByEmployee(
      servicioId,
      userId,
      dto.horas,
    );
    return {
      id: servicio.id,
      duracionPactadaHoras: servicio.duracionPactadaHoras,
    };
  }

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

  /**
   * Diez minutos mas de margen mientras el cliente espera.
   *
   * No es lo mismo que extender el servicio: aqui no se alarga lo pactado, se
   * pide aire cuando la modelo va con retraso y el reloj de espera esta a punto
   * de tumbar el servicio. En el chat era un boton que solo aparecia dentro del
   * mensaje correcto; desde aqui esta siempre a mano.
   *
   * La comprobacion de que el servicio sea suyo y el tope de tres los hace
   * `solicitarProrroga`, asi que no se repiten.
   */
  @Post('services/:servicioId/prorroga')
  @HttpCode(200)
  async pedirProrroga(
    @PortalUser() userId: string,
    @Param('servicioId', new ParseUUIDPipe()) servicioId: string,
  ) {
    return this.servicesService.solicitarProrroga(servicioId, userId);
  }

  /**
   * Califica al cliente o al chofer de un servicio.
   *
   * Una sola peticion frente a los dos pasos del chat: alli, una calificacion
   * baja abre una conversacion aparte para pedir el motivo; aqui el formulario
   * recoge las dos cosas a la vez. El DTO ya exige el comentario cuando son una
   * o dos estrellas, asi que la regla no se duplica.
   *
   * Solo se admiten las direcciones que salen de ella: no puede calificar en
   * nombre de nadie mas.
   */
  /**
   * Las calificaciones bajas que todavia puede apelar.
   *
   * Una calificacion de una o dos estrellas alimenta el score de confianza y
   * puede acabar en sancion, asi que apelarla es su unica defensa. Hasta ahora
   * solo existia detras de un boton del chat.
   */
  @Get('ratings/appealable')
  apelablesPropias(@PortalUser() userId: string) {
    return this.disciplineService.listarApelablesPropias({
      id: userId,
      rol: 'empleada',
    });
  }

  @Post('ratings/:ratingId/appeal')
  @HttpCode(200)
  apelar(
    @PortalUser() userId: string,
    @Param('ratingId', new ParseUUIDPipe()) ratingId: string,
    @Body() dto: AppealRatingDto,
  ) {
    return this.disciplineService.apelarPropia(
      { id: userId, rol: 'empleada' },
      ratingId,
      dto.reason,
    );
  }

  /**
   * Levanta un reporte de conducta sobre alguien de un servicio suyo.
   *
   * Es el mecanismo con el que se acaba bloqueando a un cliente problematico.
   * `resolveInteraction` comprueba que el servicio sea suyo, asi que aqui no se
   * repite: hacerlo dos veces invita a que una de las dos se quede atras.
   */
  @Post('reports')
  @HttpCode(201)
  reportar(@PortalUser() userId: string, @Body() dto: CreateConductReportDto) {
    return this.disciplineService.createReport(
      { id: userId, rol: 'empleada' },
      dto,
    );
  }

  @Post('ratings')
  @HttpCode(201)
  async calificar(@PortalUser() userId: string, @Body() dto: CreateRatingDto) {
    if (
      dto.direction !== 'employee_to_client' &&
      dto.direction !== 'employee_to_driver'
    ) {
      throw new ForbiddenException('Solo puedes calificar como empleada');
    }
    return this.disciplineService.createRating(
      { id: userId, rol: 'empleada' },
      dto,
    );
  }
}
