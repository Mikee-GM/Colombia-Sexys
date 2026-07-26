import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Empleadas } from '../employees/entities/employee.entity';
import { Usuarios } from '../users/entities/user.entity';

@Injectable()
export class GroupBossAssignmentService {
  constructor(private readonly dataSource: DataSource) {}

  async resolve(initialEmployeeId?: string, fallbackUserId?: string) {
    if (initialEmployeeId) {
      const employee = await this.dataSource.getRepository(Empleadas).findOne({
        where: { id: initialEmployeeId },
        relations: { jefe: true, jefeSecundario: true },
      });
      const assignedBoss =
        employee?.jefe?.activo && employee.jefe.disponible
          ? employee.jefe
          : employee?.jefeSecundario?.activo &&
              employee.jefeSecundario.disponible
            ? employee.jefeSecundario
            : null;
      if (assignedBoss) return assignedBoss.id;
    }

    if (fallbackUserId) return fallbackUserId;

    const balancedBosses: Array<{ id: string }> = await this.dataSource.query(`
      SELECT u.id
      FROM usuarios u
      LEFT JOIN group_service_requests request
        ON request.boss_id = u.id
      LEFT JOIN servicios service
        ON service.id = request.service_id
      WHERE u.rol = 'jefe'
        AND u.activo = true
        AND u.disponible = true
      GROUP BY u.id, u.created_at
      ORDER BY COUNT(DISTINCT CASE
        WHEN request.status IN (
          'esperando_jefe', 'seleccionando', 'reservada', 'esperando_pago'
        ) OR (
          service.service_type = 'grupal'
          AND service.estado IN ('pendiente', 'en_curso')
        )
        THEN request.id
      END) ASC,
      u.created_at ASC,
      u.id ASC
      LIMIT 1
    `);
    if (balancedBosses[0]?.id) return balancedBosses[0].id;

    const admin = await this.dataSource.getRepository(Usuarios).findOne({
      where: { rol: 'admin', activo: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    if (admin) return admin.id;

    throw new ConflictException(
      'No hay un jefe disponible para atender el servicio grupal',
    );
  }
}
