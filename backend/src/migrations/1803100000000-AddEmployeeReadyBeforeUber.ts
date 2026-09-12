import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cuando la modelo avisa que ya esta lista para salir.
 *
 * El Uber se pedia en el mismo momento en que el jefe autorizaba el servicio,
 * asi que el coche llegaba mientras ella se estaba arreglando y el cronometro
 * de espera corria contra nadie. Con esta marca el enlace del Uber no aparece
 * hasta que ella dice que ya puede salir.
 *
 * Es nulo mientras se la espera y solo aplica al traslado de ida con Uber: el
 * chofer propio se sigue despachando igual, porque ahi no hay tarifa corriendo
 * mientras espera.
 */
export class AddEmployeeReadyBeforeUber1803100000000 implements MigrationInterface {
  name = 'AddEmployeeReadyBeforeUber1803100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * El relleno solo corre la primera vez, y por eso se mira antes si la
     * columna ya existia.
     *
     * El DDL es idempotente, pero el UPDATE de abajo no lo es: pasado el
     * despliegue, un servicio en curso con la columna vacia no es uno que se
     * quedo sin la marca, es uno que esta esperando a que ella pulse el boton.
     * Volver a rellenarlo le daria al jefe el enlace del Uber sin que ella
     * hubiera avisado, que es justo lo que este paso existe para evitar.
     */
    const [{ existia }] = (await queryRunner.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'servicios'
            AND column_name = 'empleada_lista_at'
       ) AS existia`,
    )) as Array<{ existia: boolean }>;

    await queryRunner.query(
      `ALTER TABLE public.servicios
         ADD COLUMN IF NOT EXISTS "empleada_lista_at" timestamp with time zone`,
    );

    if (existia) return;

    /*
     * Los servicios que ya estaban en marcha al desplegar se dan por listos.
     * Sin esto, un servicio vivo se quedaria esperando un boton que su modelo
     * nunca vio, y el jefe sin poder pedirle el Uber.
     */
    await queryRunner.query(
      `UPDATE public.servicios
          SET "empleada_lista_at" = COALESCE("hora_inicio_servicio", now())
        WHERE "empleada_lista_at" IS NULL
          AND "estado" IN ('en_curso', 'finalizado')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.servicios
         DROP COLUMN IF EXISTS "empleada_lista_at"`,
    );
  }
}
