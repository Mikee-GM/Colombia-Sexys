import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1783000000000 implements MigrationInterface {
  name = 'InitialSchema1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "empleada_fotos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "empleada_id" uuid NOT NULL, "url" text NOT NULL, "orden" smallint NOT NULL DEFAULT 0, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a67e10f6dade74044877b36c056" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "empleada_fotos_pkey" ON "empleada_fotos"  ("id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_empleada_fotos_empleada" ON "empleada_fotos"  ("empleada_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "empleada_fotos_empleada_id_orden_key" ON "empleada_fotos"  ("empleada_id", "orden") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."extensiones_servicio_aceptada_por_enum" AS ENUM('cliente', 'empleada')`,
    );
    await queryRunner.query(
      `CREATE TABLE "extensiones_servicio" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "servicio_id" uuid NOT NULL, "horas_agregadas" numeric(4,2) NOT NULL, "monto_agregado" numeric(10,2) NOT NULL, "aceptada_por" "public"."extensiones_servicio_aceptada_por_enum" NOT NULL, "registrada_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_340ae96e5def64bc193e20a09e5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_extensiones_servicio_servicio" ON "extensiones_servicio"  ("servicio_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "extensiones_servicio_pkey" ON "extensiones_servicio"  ("id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "extras_catalogo" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "empleada_id" uuid NOT NULL, "nombre" character varying(150) NOT NULL, "precio" numeric(10,2) NOT NULL, "activo" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_78ff74b1308d31926b83ccc0fe0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "extras_catalogo_pkey" ON "extras_catalogo"  ("id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_extras_catalogo_empleada_activo" ON "extras_catalogo"  ("empleada_id", "activo") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_extras_catalogo_empleada" ON "extras_catalogo"  ("empleada_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."extras_servicio_metodo_pago_enum" AS ENUM('tarjeta', 'transferencia', 'efectivo')`,
    );
    await queryRunner.query(
      `CREATE TABLE "extras_servicio" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "servicio_id" uuid NOT NULL, "extra_catalogo_id" uuid NOT NULL, "precio_cobrado" numeric(10,2) NOT NULL, "metodo_pago" "public"."extras_servicio_metodo_pago_enum" NOT NULL, "registrado_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "registrado_por" uuid, CONSTRAINT "PK_c64a18b9e5925dd382e22a7d1cb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_extras_servicio_servicio" ON "extras_servicio"  ("servicio_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "extras_servicio_pkey" ON "extras_servicio"  ("id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_extras_servicio_catalogo" ON "extras_servicio"  ("extra_catalogo_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "prorrogas" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "servicio_id" uuid NOT NULL, "numero_prorroga" smallint NOT NULL, "minutos_solicitados" smallint NOT NULL, "solicitada_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "aprobada" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_11deb30e7378441daa8d211ab73" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_prorrogas_servicio" ON "prorrogas"  ("servicio_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "prorrogas_servicio_id_numero_prorroga_key" ON "prorrogas"  ("numero_prorroga", "servicio_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "prorrogas_pkey" ON "prorrogas"  ("id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "choferes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "usuario_id" uuid NOT NULL, "nombre" character varying(255) NOT NULL, "telefono" character varying(30) NOT NULL, "disponible" boolean NOT NULL DEFAULT false, "ubicacion_lat" numeric(10,7), "ubicacion_lng" numeric(10,7), "ultima_ubicacion_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "vehiculo_marca" character varying(255), "vehiculo_modelo" character varying(255), "vehiculo_color" character varying(255), "vehiculo_placa" character varying(50), CONSTRAINT "UQ_2dea093853d48942891f276ad9c" UNIQUE ("usuario_id"), CONSTRAINT "REL_2dea093853d48942891f276ad9" UNIQUE ("usuario_id"), CONSTRAINT "PK_7195d73953de6e5118ac0b1897f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "choferes_usuario_id_key" ON "choferes"  ("usuario_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "choferes_pkey" ON "choferes"  ("id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_choferes_disponible" ON "choferes"  ("disponible") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."viajes_tipo_enum" AS ENUM('ida', 'regreso')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."viajes_zona_enum" AS ENUM('montecarlo', 'majestic', 'domicilio')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."viajes_estado_enum" AS ENUM('notificado', 'aceptado', 'llegado', 'en_curso', 'finalizado', 'rechazado', 'cancelado')`,
    );
    await queryRunner.query(
      `CREATE TABLE "viajes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "servicio_id" uuid NOT NULL, "chofer_id" uuid, "tipo" "public"."viajes_tipo_enum" NOT NULL, "zona" "public"."viajes_zona_enum" NOT NULL, "tarifa" numeric(10,2) NOT NULL, "estado" "public"."viajes_estado_enum" NOT NULL DEFAULT 'notificado', "hora_notificacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "hora_aceptacion" TIMESTAMP WITH TIME ZONE, "hora_inicio_viaje" TIMESTAMP WITH TIME ZONE, "hora_fin_viaje" TIMESTAMP WITH TIME ZONE, "telegram_empleada_msg_chofer_camino_id" character varying, "telegram_empleada_msg_chofer_llegado_id" character varying, "choferes_notificados" jsonb NOT NULL DEFAULT '[]'::jsonb, "telegram_chofer_msg_oferta_id" character varying, CONSTRAINT "PK_494f8b59dff1674f6b4efbcea2a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_viajes_servicio" ON "viajes"  ("servicio_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "viajes_servicio_id_tipo_key" ON "viajes"  ("servicio_id", "tipo") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "viajes_pkey" ON "viajes"  ("id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_viajes_estado" ON "viajes"  ("estado") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_viajes_chofer" ON "viajes"  ("chofer_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."loyalty_transactions_type_enum" AS ENUM('earned', 'manual_adjustment', 'tier_assignment', 'reversal')`,
    );
    await queryRunner.query(
      `CREATE TABLE "loyalty_transactions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "cliente_id" uuid NOT NULL, "servicio_id" uuid, "created_by_user_id" uuid, "type" "public"."loyalty_transactions_type_enum" NOT NULL, "points" integer NOT NULL, "amount_basis" numeric(12,2), "description" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_df453f678b7575221b335673362" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "loyalty_transactions_service_type_key" ON "loyalty_transactions"  ("servicio_id", "type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_loyalty_transactions_created_at" ON "loyalty_transactions"  ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_loyalty_transactions_servicio" ON "loyalty_transactions"  ("servicio_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_loyalty_transactions_cliente" ON "loyalty_transactions"  ("cliente_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."servicios_metodo_pago_enum" AS ENUM('efectivo', 'tarjeta', 'transferencia')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."servicios_estado_enum" AS ENUM('pendiente', 'en_curso', 'finalizado', 'cancelado', 'pendiente_encadenado')`,
    );
    await queryRunner.query(
      `CREATE TABLE "servicios" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "empleada_id" uuid NOT NULL, "cliente_id" uuid NOT NULL, "jefe_id" uuid NOT NULL, "metodo_pago" "public"."servicios_metodo_pago_enum" NOT NULL, "duracion_pactada_horas" numeric(4,2) NOT NULL, "duracion_final_horas" numeric(4,2), "ubicacion_cliente_lat" numeric(10,7) NOT NULL, "ubicacion_cliente_lng" numeric(10,7) NOT NULL, "precio_base_hora_pactado" numeric(10,2) NOT NULL, "total_base" numeric(10,2) NOT NULL DEFAULT 0, "total_extras" numeric(10,2) NOT NULL DEFAULT 0, "total_final" numeric(10,2) NOT NULL DEFAULT 0, "hora_inicio_servicio" TIMESTAMP WITH TIME ZONE, "hora_fin_servicio" TIMESTAMP WITH TIME ZONE, "hora_llegada_casa" TIMESTAMP WITH TIME ZONE, "prorrogas_usadas" smallint NOT NULL DEFAULT 0, "estado" "public"."servicios_estado_enum" NOT NULL DEFAULT 'pendiente', "notas" text, "telegram_cliente_mensaje_id" character varying, "telegram_empleada_mensaje_id" character varying, "cliente_telegram_id" bigint, "ia_activa" boolean NOT NULL DEFAULT true, "telegram_thread_id" bigint, "calificacion" integer, "comentarios_calificacion" text, "notificacion_extension_enviada" boolean NOT NULL DEFAULT false, "servicio_previo_id" uuid, "hora_inicio_estimada" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_fefcdbfeaf506ca485a6dcfb0d8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_servicios_jefe" ON "servicios"  ("jefe_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "servicios_pkey" ON "servicios"  ("id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_servicios_estado" ON "servicios"  ("estado") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_servicios_empleada" ON "servicios"  ("empleada_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_servicios_created_at" ON "servicios"  ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_servicios_cliente" ON "servicios"  ("cliente_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."conversaciones_telegram_emisor_enum" AS ENUM('ia', 'jefe', 'cliente')`,
    );
    await queryRunner.query(
      `CREATE TABLE "conversaciones_telegram" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "cliente_id" uuid NOT NULL, "servicio_id" uuid, "emisor" "public"."conversaciones_telegram_emisor_enum" NOT NULL, "mensaje" text NOT NULL, "ia_activa" boolean NOT NULL DEFAULT true, "enviado_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a1cbab8f816262929baf6b8dde6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_conversaciones_servicio" ON "conversaciones_telegram"  ("servicio_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "conversaciones_telegram_pkey" ON "conversaciones_telegram"  ("id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_conversaciones_enviado_at" ON "conversaciones_telegram"  ("enviado_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_conversaciones_cliente" ON "conversaciones_telegram"  ("cliente_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "loyalty_tiers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "code" character varying(50) NOT NULL, "name" character varying(120) NOT NULL, "min_spend" numeric(12,2) NOT NULL DEFAULT 0, "earn_rate" numeric(10,4) NOT NULL DEFAULT 0.1000, "active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT 0, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_65c10c10fc8319506a8119998a0" UNIQUE ("code"), CONSTRAINT "PK_a669fdbbbe951b211e403c977a6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_loyalty_tiers_active_min_spend" ON "loyalty_tiers"  ("active", "min_spend") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "loyalty_tiers_code_key" ON "loyalty_tiers"  ("code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."client_memberships_status_enum" AS ENUM('active', 'inactive', 'suspended')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."client_memberships_assignment_type_enum" AS ENUM('automatic', 'manual')`,
    );
    await queryRunner.query(
      `CREATE TABLE "client_memberships" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "cliente_id" uuid NOT NULL, "tier_id" uuid NOT NULL, "status" "public"."client_memberships_status_enum" NOT NULL DEFAULT 'active', "assignment_type" "public"."client_memberships_assignment_type_enum" NOT NULL DEFAULT 'automatic', "points_balance" integer NOT NULL DEFAULT 0, "lifetime_points" integer NOT NULL DEFAULT 0, "lifetime_spend" numeric(12,2) NOT NULL DEFAULT 0, "assigned_by_user_id" uuid, "assignment_notes" text, "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "assigned_at" TIMESTAMP WITH TIME ZONE, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_a9354c010ed1e0ffafd75f0fda1" UNIQUE ("cliente_id"), CONSTRAINT "REL_a9354c010ed1e0ffafd75f0fda" UNIQUE ("cliente_id"), CONSTRAINT "PK_9af651aed817371e186e0c0669c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_client_memberships_tier" ON "client_memberships"  ("tier_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "client_memberships_cliente_id_key" ON "client_memberships"  ("cliente_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "clientes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "telegram_chat_id" bigint NOT NULL, "nombre_telegram" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "primer_contacto_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_31c98312c9272859a2229bdda6c" UNIQUE ("telegram_chat_id"), CONSTRAINT "PK_d76bf3571d906e4e86470482c08" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "clientes_telegram_chat_id_key" ON "clientes"  ("telegram_chat_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "clientes_pkey" ON "clientes"  ("id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "alertas_clientes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "cliente_id" uuid NOT NULL, "servicio_id" uuid, "mensaje_original" text NOT NULL, "emocion_detectada" character varying(50) NOT NULL, "score_sentimiento" numeric(4,3) NOT NULL, "atendida" boolean NOT NULL DEFAULT false, "atendida_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "atendida_por" uuid, CONSTRAINT "PK_6ff5aaf44917c6d5f25bc4088b9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_alertas_servicio" ON "alertas_clientes"  ("servicio_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "alertas_clientes_pkey" ON "alertas_clientes"  ("id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_alertas_cliente" ON "alertas_clientes"  ("cliente_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_alertas_atendida" ON "alertas_clientes"  ("atendida") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."usuarios_rol_enum" AS ENUM('jefe', 'empleada', 'chofer', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TABLE "usuarios" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying(255) NOT NULL, "password_hash" text NOT NULL, "rol" "public"."usuarios_rol_enum" NOT NULL, "nombre" character varying(255), "apellido" character varying(255), "activo" boolean NOT NULL DEFAULT true, "telegram_chat_id" bigint, "grupo_telegram_id" bigint, "telegram_verification_code" character varying(255), "telegram_verification_expires_at" TIMESTAMP WITH TIME ZONE, "telefono" character varying(50), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_login_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_446adfc18b35418aac32ae0b7b5" UNIQUE ("email"), CONSTRAINT "UQ_71de711296fcfcca3d676f4df9b" UNIQUE ("telegram_chat_id"), CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "usuarios_telegram_chat_id_key" ON "usuarios"  ("telegram_chat_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_usuarios_rol" ON "usuarios"  ("rol") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "usuarios_pkey" ON "usuarios"  ("id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"  ("email") `,
    );
    await queryRunner.query(
      `CREATE TABLE "empleadas" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "usuario_id" uuid NOT NULL, "nombre_real" character varying(255) NOT NULL, "nombre_artistico" character varying(255) NOT NULL, "slug_catalogo" character varying(100) NOT NULL, "foto_perfil_url" text, "descripcion" text, "link_x" character varying(255), "contact_label" character varying(100), "precio_base_hora" numeric(10,2) NOT NULL, "disponible" boolean NOT NULL DEFAULT false, "catalogo_activo" boolean NOT NULL DEFAULT true, "ubicacion_lat" numeric(10,7), "ubicacion_lng" numeric(10,7), "ultima_ubicacion_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "apartment_id" uuid, "jefe_id" uuid, CONSTRAINT "UQ_4dac7fbb10edd9adffa303cf6fc" UNIQUE ("usuario_id"), CONSTRAINT "UQ_25d5846d1a089d3ca5900636185" UNIQUE ("slug_catalogo"), CONSTRAINT "REL_4dac7fbb10edd9adffa303cf6f" UNIQUE ("usuario_id"), CONSTRAINT "PK_eb80f0b7bfd01557cc5cebefc39" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "empleadas_usuario_id_key" ON "empleadas"  ("usuario_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "empleadas_slug_catalogo_key" ON "empleadas"  ("slug_catalogo") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "empleadas_pkey" ON "empleadas"  ("id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_empleadas_disponible" ON "empleadas"  ("disponible") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_empleadas_catalogo_activo" ON "empleadas"  ("catalogo_activo") `,
    );
    await queryRunner.query(
      `CREATE TABLE "apartments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(255) NOT NULL, "direccion" text, "descripcion" text, "ubicacion_lat" numeric(10,7), "ubicacion_lng" numeric(10,7), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f6058e85d6d715dbe22b72fe722" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "telegram_sessions" ("key" character varying(255) NOT NULL, "data" jsonb, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6f538baec8544a4efa4ded3dcdd" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "empleada_fotos" ADD CONSTRAINT "FK_1fb684931383502b5e8cb80f4fc" FOREIGN KEY ("empleada_id") REFERENCES "empleadas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "extensiones_servicio" ADD CONSTRAINT "FK_27b5b99c53fe3aa1df1907e55a1" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "extras_catalogo" ADD CONSTRAINT "FK_c021e5b34c1d635452614ef075c" FOREIGN KEY ("empleada_id") REFERENCES "empleadas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "extras_servicio" ADD CONSTRAINT "FK_dd3387bba65c6765cae6fa6c5b3" FOREIGN KEY ("extra_catalogo_id") REFERENCES "extras_catalogo"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "extras_servicio" ADD CONSTRAINT "FK_ddb5a9375897e2c22eddfeb1b08" FOREIGN KEY ("registrado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "extras_servicio" ADD CONSTRAINT "FK_9b43ecd4a3a08065ac16fa6f35a" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "prorrogas" ADD CONSTRAINT "FK_7b97a28815b0b51ffa0c2cfa508" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "choferes" ADD CONSTRAINT "FK_2dea093853d48942891f276ad9c" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "viajes" ADD CONSTRAINT "FK_f277fcfb42bf3b6a67bb0281e7b" FOREIGN KEY ("chofer_id") REFERENCES "choferes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "viajes" ADD CONSTRAINT "FK_5e53ccfba23544aa492c4172ad5" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "FK_a823912a8a7aa0115d2c0011f32" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "FK_615011ab7fef63fb9d7910aecef" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "FK_b78fb3d13da3b3d716f8b848515" FOREIGN KEY ("created_by_user_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "servicios" ADD CONSTRAINT "FK_2222734377bc9808ae98cf12ff1" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "servicios" ADD CONSTRAINT "FK_1fd705987516f6766736a579a74" FOREIGN KEY ("empleada_id") REFERENCES "empleadas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "servicios" ADD CONSTRAINT "FK_86e006c066fd0dd3bdf8657768f" FOREIGN KEY ("jefe_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "servicios" ADD CONSTRAINT "FK_7a0782e039a708b24bacb7a7ce6" FOREIGN KEY ("servicio_previo_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversaciones_telegram" ADD CONSTRAINT "FK_9d05d76273921002e1f60c5d75e" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversaciones_telegram" ADD CONSTRAINT "FK_d3316c137d51d3d188423f6841b" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_memberships" ADD CONSTRAINT "FK_a9354c010ed1e0ffafd75f0fda1" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_memberships" ADD CONSTRAINT "FK_b51ff985e9dcecd3c99dcd3365a" FOREIGN KEY ("tier_id") REFERENCES "loyalty_tiers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_memberships" ADD CONSTRAINT "FK_0d0378eabcdfe2df632c2be77b7" FOREIGN KEY ("assigned_by_user_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "alertas_clientes" ADD CONSTRAINT "FK_59fbac54f7f7570d04cc2c49a9e" FOREIGN KEY ("atendida_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "alertas_clientes" ADD CONSTRAINT "FK_f8586d2454996457576bb522000" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "alertas_clientes" ADD CONSTRAINT "FK_c976596ebc7a3fd529701b44beb" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "empleadas" ADD CONSTRAINT "FK_4dac7fbb10edd9adffa303cf6fc" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "empleadas" ADD CONSTRAINT "FK_a0bcb1d816d94e6265647e69f80" FOREIGN KEY ("apartment_id") REFERENCES "apartments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "empleadas" ADD CONSTRAINT "FK_c75f4c706f7547b71d426ecb47f" FOREIGN KEY ("jefe_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "empleadas" DROP CONSTRAINT "FK_c75f4c706f7547b71d426ecb47f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "empleadas" DROP CONSTRAINT "FK_a0bcb1d816d94e6265647e69f80"`,
    );
    await queryRunner.query(
      `ALTER TABLE "empleadas" DROP CONSTRAINT "FK_4dac7fbb10edd9adffa303cf6fc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "alertas_clientes" DROP CONSTRAINT "FK_c976596ebc7a3fd529701b44beb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "alertas_clientes" DROP CONSTRAINT "FK_f8586d2454996457576bb522000"`,
    );
    await queryRunner.query(
      `ALTER TABLE "alertas_clientes" DROP CONSTRAINT "FK_59fbac54f7f7570d04cc2c49a9e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_memberships" DROP CONSTRAINT "FK_0d0378eabcdfe2df632c2be77b7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_memberships" DROP CONSTRAINT "FK_b51ff985e9dcecd3c99dcd3365a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_memberships" DROP CONSTRAINT "FK_a9354c010ed1e0ffafd75f0fda1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversaciones_telegram" DROP CONSTRAINT "FK_d3316c137d51d3d188423f6841b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversaciones_telegram" DROP CONSTRAINT "FK_9d05d76273921002e1f60c5d75e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "servicios" DROP CONSTRAINT "FK_7a0782e039a708b24bacb7a7ce6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "servicios" DROP CONSTRAINT "FK_86e006c066fd0dd3bdf8657768f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "servicios" DROP CONSTRAINT "FK_1fd705987516f6766736a579a74"`,
    );
    await queryRunner.query(
      `ALTER TABLE "servicios" DROP CONSTRAINT "FK_2222734377bc9808ae98cf12ff1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transactions" DROP CONSTRAINT "FK_b78fb3d13da3b3d716f8b848515"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transactions" DROP CONSTRAINT "FK_615011ab7fef63fb9d7910aecef"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loyalty_transactions" DROP CONSTRAINT "FK_a823912a8a7aa0115d2c0011f32"`,
    );
    await queryRunner.query(
      `ALTER TABLE "viajes" DROP CONSTRAINT "FK_5e53ccfba23544aa492c4172ad5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "viajes" DROP CONSTRAINT "FK_f277fcfb42bf3b6a67bb0281e7b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "choferes" DROP CONSTRAINT "FK_2dea093853d48942891f276ad9c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "prorrogas" DROP CONSTRAINT "FK_7b97a28815b0b51ffa0c2cfa508"`,
    );
    await queryRunner.query(
      `ALTER TABLE "extras_servicio" DROP CONSTRAINT "FK_9b43ecd4a3a08065ac16fa6f35a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "extras_servicio" DROP CONSTRAINT "FK_ddb5a9375897e2c22eddfeb1b08"`,
    );
    await queryRunner.query(
      `ALTER TABLE "extras_servicio" DROP CONSTRAINT "FK_dd3387bba65c6765cae6fa6c5b3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "extras_catalogo" DROP CONSTRAINT "FK_c021e5b34c1d635452614ef075c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "extensiones_servicio" DROP CONSTRAINT "FK_27b5b99c53fe3aa1df1907e55a1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "empleada_fotos" DROP CONSTRAINT "FK_1fb684931383502b5e8cb80f4fc"`,
    );
    await queryRunner.query(`DROP TABLE "telegram_sessions"`);
    await queryRunner.query(`DROP TABLE "apartments"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_empleadas_catalogo_activo"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_empleadas_disponible"`);
    await queryRunner.query(`DROP INDEX "public"."empleadas_pkey"`);
    await queryRunner.query(
      `DROP INDEX "public"."empleadas_slug_catalogo_key"`,
    );
    await queryRunner.query(`DROP INDEX "public"."empleadas_usuario_id_key"`);
    await queryRunner.query(`DROP TABLE "empleadas"`);
    await queryRunner.query(`DROP INDEX "public"."usuarios_email_key"`);
    await queryRunner.query(`DROP INDEX "public"."usuarios_pkey"`);
    await queryRunner.query(`DROP INDEX "public"."idx_usuarios_rol"`);
    await queryRunner.query(
      `DROP INDEX "public"."usuarios_telegram_chat_id_key"`,
    );
    await queryRunner.query(`DROP TABLE "usuarios"`);
    await queryRunner.query(`DROP TYPE "public"."usuarios_rol_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_alertas_atendida"`);
    await queryRunner.query(`DROP INDEX "public"."idx_alertas_cliente"`);
    await queryRunner.query(`DROP INDEX "public"."alertas_clientes_pkey"`);
    await queryRunner.query(`DROP INDEX "public"."idx_alertas_servicio"`);
    await queryRunner.query(`DROP TABLE "alertas_clientes"`);
    await queryRunner.query(`DROP INDEX "public"."clientes_pkey"`);
    await queryRunner.query(
      `DROP INDEX "public"."clientes_telegram_chat_id_key"`,
    );
    await queryRunner.query(`DROP TABLE "clientes"`);
    await queryRunner.query(
      `DROP INDEX "public"."client_memberships_cliente_id_key"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_client_memberships_tier"`,
    );
    await queryRunner.query(`DROP TABLE "client_memberships"`);
    await queryRunner.query(
      `DROP TYPE "public"."client_memberships_assignment_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."client_memberships_status_enum"`,
    );
    await queryRunner.query(`DROP INDEX "public"."loyalty_tiers_code_key"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_loyalty_tiers_active_min_spend"`,
    );
    await queryRunner.query(`DROP TABLE "loyalty_tiers"`);
    await queryRunner.query(`DROP INDEX "public"."idx_conversaciones_cliente"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_conversaciones_enviado_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."conversaciones_telegram_pkey"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_conversaciones_servicio"`,
    );
    await queryRunner.query(`DROP TABLE "conversaciones_telegram"`);
    await queryRunner.query(
      `DROP TYPE "public"."conversaciones_telegram_emisor_enum"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_servicios_cliente"`);
    await queryRunner.query(`DROP INDEX "public"."idx_servicios_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_servicios_empleada"`);
    await queryRunner.query(`DROP INDEX "public"."idx_servicios_estado"`);
    await queryRunner.query(`DROP INDEX "public"."servicios_pkey"`);
    await queryRunner.query(`DROP INDEX "public"."idx_servicios_jefe"`);
    await queryRunner.query(`DROP TABLE "servicios"`);
    await queryRunner.query(`DROP TYPE "public"."servicios_estado_enum"`);
    await queryRunner.query(`DROP TYPE "public"."servicios_metodo_pago_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_loyalty_transactions_cliente"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_loyalty_transactions_servicio"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_loyalty_transactions_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."loyalty_transactions_service_type_key"`,
    );
    await queryRunner.query(`DROP TABLE "loyalty_transactions"`);
    await queryRunner.query(
      `DROP TYPE "public"."loyalty_transactions_type_enum"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_viajes_chofer"`);
    await queryRunner.query(`DROP INDEX "public"."idx_viajes_estado"`);
    await queryRunner.query(`DROP INDEX "public"."viajes_pkey"`);
    await queryRunner.query(
      `DROP INDEX "public"."viajes_servicio_id_tipo_key"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_viajes_servicio"`);
    await queryRunner.query(`DROP TABLE "viajes"`);
    await queryRunner.query(`DROP TYPE "public"."viajes_estado_enum"`);
    await queryRunner.query(`DROP TYPE "public"."viajes_zona_enum"`);
    await queryRunner.query(`DROP TYPE "public"."viajes_tipo_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_choferes_disponible"`);
    await queryRunner.query(`DROP INDEX "public"."choferes_pkey"`);
    await queryRunner.query(`DROP INDEX "public"."choferes_usuario_id_key"`);
    await queryRunner.query(`DROP TABLE "choferes"`);
    await queryRunner.query(`DROP INDEX "public"."prorrogas_pkey"`);
    await queryRunner.query(
      `DROP INDEX "public"."prorrogas_servicio_id_numero_prorroga_key"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_prorrogas_servicio"`);
    await queryRunner.query(`DROP TABLE "prorrogas"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_extras_servicio_catalogo"`,
    );
    await queryRunner.query(`DROP INDEX "public"."extras_servicio_pkey"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_extras_servicio_servicio"`,
    );
    await queryRunner.query(`DROP TABLE "extras_servicio"`);
    await queryRunner.query(
      `DROP TYPE "public"."extras_servicio_metodo_pago_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_extras_catalogo_empleada"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_extras_catalogo_empleada_activo"`,
    );
    await queryRunner.query(`DROP INDEX "public"."extras_catalogo_pkey"`);
    await queryRunner.query(`DROP TABLE "extras_catalogo"`);
    await queryRunner.query(`DROP INDEX "public"."extensiones_servicio_pkey"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_extensiones_servicio_servicio"`,
    );
    await queryRunner.query(`DROP TABLE "extensiones_servicio"`);
    await queryRunner.query(
      `DROP TYPE "public"."extensiones_servicio_aceptada_por_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."empleada_fotos_empleada_id_orden_key"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_empleada_fotos_empleada"`,
    );
    await queryRunner.query(`DROP INDEX "public"."empleada_fotos_pkey"`);
    await queryRunner.query(`DROP TABLE "empleada_fotos"`);
  }
}
