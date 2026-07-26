import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdjustPointsDto } from './dto/adjust-points.dto';
import { CreateLoyaltyTierDto } from './dto/create-loyalty-tier.dto';
import { SetClientTierDto } from './dto/set-client-tier.dto';
import { UpdateLoyaltyTierDto } from './dto/update-loyalty-tier.dto';
import { ClientMembership } from './entities/client-membership.entity';
import { LoyaltyTier } from './entities/loyalty-tier.entity';
import { LoyaltyTransaction } from './entities/loyalty-transaction.entity';
import { LoyaltyService } from './loyalty.service';
import {
  ApiActionDocs,
  ApiControllerDocs,
  ApiFindAllByParamDocs,
  ApiCreateDocs,
  ApiFindAllDocs,
  ApiFindOneDocs,
  ApiUpdateDocs,
} from '../common/swagger/api-docs.decorators';

@Controller('loyalty')
@ApiControllerDocs('loyalty', true)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'jefe')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('tiers')
  @ApiFindAllDocs({
    tag: 'loyalty tiers',
    entity: LoyaltyTier,
    protected: true,
  })
  listTiers() {
    return this.loyaltyService.listTiers();
  }

  @Post('tiers')
  @ApiCreateDocs({
    tag: 'loyalty tiers',
    entity: LoyaltyTier,
    createDto: CreateLoyaltyTierDto,
    protected: true,
  })
  createTier(@Body() createTierDto: CreateLoyaltyTierDto) {
    return this.loyaltyService.createTier(createTierDto);
  }

  @Patch('tiers/:id')
  @ApiUpdateDocs({
    tag: 'loyalty tiers',
    entity: LoyaltyTier,
    updateDto: UpdateLoyaltyTierDto,
    protected: true,
  })
  updateTier(
    @Param('id') id: string,
    @Body() updateTierDto: UpdateLoyaltyTierDto,
  ) {
    return this.loyaltyService.updateTier(id, updateTierDto);
  }

  @Get('clients/:clienteId/membership')
  @ApiFindOneDocs({
    tag: 'client membership',
    entity: ClientMembership,
    idName: 'clienteId',
    idDescription: 'ID del cliente',
    protected: true,
  })
  getClientMembership(@Param('clienteId') clienteId: string) {
    return this.loyaltyService.getClientMembership(clienteId);
  }

  @Get('clients/:clienteId/transactions')
  @ApiFindAllByParamDocs({
    tag: 'client loyalty transactions',
    entity: LoyaltyTransaction,
    idName: 'clienteId',
    idDescription: 'ID del cliente',
    protected: true,
  })
  listClientTransactions(@Param('clienteId') clienteId: string) {
    return this.loyaltyService.listClientTransactions(clienteId);
  }

  @Post('clients/:clienteId/tier')
  @ApiActionDocs(
    'Asignar nivel de lealtad a un cliente',
    true,
    'ID del cliente',
    'clienteId',
  )
  setClientTier(
    @Param('clienteId') clienteId: string,
    @Body() setTierDto: SetClientTierDto,
    @Req() req: any,
  ) {
    return this.loyaltyService.setClientTier(
      clienteId,
      setTierDto,
      req.user.id,
    );
  }

  @Post('clients/:clienteId/recalculate-tier')
  @ApiActionDocs(
    'Recalcular nivel de lealtad de un cliente',
    true,
    'ID del cliente',
    'clienteId',
  )
  recalculateClientTier(@Param('clienteId') clienteId: string) {
    return this.loyaltyService.recalculateClientTier(clienteId);
  }

  @Post('clients/:clienteId/adjust-points')
  @ApiActionDocs(
    'Ajustar puntos de lealtad de un cliente',
    true,
    'ID del cliente',
    'clienteId',
  )
  adjustPoints(
    @Param('clienteId') clienteId: string,
    @Body() adjustPointsDto: AdjustPointsDto,
    @Req() req: any,
  ) {
    return this.loyaltyService.adjustPoints(
      clienteId,
      adjustPointsDto,
      req.user.id,
    );
  }
}
