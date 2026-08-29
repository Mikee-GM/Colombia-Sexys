import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Servicios que ocurrieron fuera del sistema y hay que dejar registrados.
 *
 * La empleada los solicita desde su chat y el jefe los autoriza; al aprobarse
 * nace un servicio normal, ya finalizado y marcado como registro manual, que
 * entra en su corte y en sus estadisticas como cualquier otro.
 *
 * `cliente_id` pasa a admitir nulo: en un servicio registrado a posteriori
 * puede no haber un cliente identificado. Meterlos a todos bajo un cliente
 * generico habria ensuciado justo la ficha del cliente y el historial que se
 * consulta para sancionarlo, asi que el nombre suelto va en su propia columna.
 */
export class AddManualServiceRequests1795000000000
  implements MigrationInterface
{
  name = 'AddManualServiceRequests1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "servicios"
      ALTER COLUMN "cliente_id" DROP NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "servicios"
      ADD COLUMN IF NOT EXISTS "registro_manual" boolean NOT NULL DEFAULT false;
    `);
    await queryRunner.query(`
      ALTER TABLE "servicios"
      ADD COLUMN IF NOT EXISTS "cliente_nombre_libre" character varying(255);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "solicitudes_servicio_manual" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empleada_id" uuid NOT NULL,
        "jefe_id" uuid NOT NULL,
        "cliente_id" uuid,
        "cliente_nombre_libre" character varying(255),
        "fecha_servicio" timestamptz NOT NULL,
        "duracion_horas" numeric(4,2) NOT NULL,
        "metodo_pago" character varying(20) NOT NULL,
        "monto_cobrado" numeric(10,2) NOT NULL,
        "ubicacion" character varying(255),
        "motivo" text NOT NULL,
        "estado" character varying(20) NOT NULL DEFAULT 'pendiente',
        "servicio_id" uuid,
        "nota_resolucion" text,
        "resuelto_por_user_id" uuid,
        "resuelto_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "solicitudes_servicio_manual_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_solicitud_manual_empleada" FOREIGN KEY ("empleada_id")
          REFERENCES "empleadas"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_solicitud_manual_jefe" FOREIGN KEY ("jefe_id")
          REFERENCES "usuarios"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_solicitud_manual_cliente" FOREIGN KEY ("cliente_id")
          REFERENCES "clientes"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_solicitud_manual_servicio" FOREIGN KEY ("servicio_id")
          REFERENCES "servicios"("id") ON DELETE SET NULL
      );
    `);

    /*
     * El jefe consulta las pendientes constantemente y la empleada solo las
     * suyas: un indice por estado y otro por empleada cubren las dos lecturas.
     */
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_solicitud_manual_estado"
        ON "solicitudes_servicio_manual" ("estado", "created_at" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_solicitud_manual_empleada"
        ON "solicitudes_servicio_manual" ("empleada_id", "created_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "solicitudes_servicio_manual" CASCADE;`,
    );
    await queryRunner.query(
      `ALTER TABLE "servicios" DROP COLUMN IF EXISTS "cliente_nombre_libre";`,
    );
    await queryRunner.query(
      `ALTER TABLE "servicios" DROP COLUMN IF EXISTS "registro_manual";`,
    );
    /*
     * No se restaura el NOT NULL de `cliente_id`: si ya hay servicios
     * registrados sin cliente, la vuelta atras fallaria a mitad y dejaria la
     * base peor de lo que estaba.
     */
  }
}
