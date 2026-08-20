-- ============================================================================
-- SCRIPT DE LIMPIEZA SEGURA DE BASE DE DATOS (PRODUCCIÓN VPS)
-- Colombia-Sexys PostgreSQL Database Cleanup Script
-- ============================================================================
-- Este script realiza una limpieza profunda de:
-- 1. Servicios antiguos/bugueados y sus dependencias (viajes, extensiones, extras, pagos, comprobantes)
-- 2. Conversaciones de Telegram y sesiones draft de bot desactualizadas
-- 3. Alertas de clientes obsoletas y transacciones de lealtad
-- 4. Evaluaciones/candidatas de screening antiguas o incompletas
-- 5. Liquidaciones, deudas y obligaciones de efectivo residuales
-- 6. Reportes disciplinarios y ratings de servicios pasados
-- 7. Borrado de modelos deseadas ('perzi', 'Mike', 'Perzi')
-- 8. Agrega columna 'options' a screening_questions si no existe
--
-- PRESERVA:
-- - Usuarios (Admins, Jefes, Choferes, y Modelos activas que no se especifiquen)
-- - Cuestionarios y preguntas de reglamento
-- - Bancos de preguntas de candidatas
-- - Cuentas bancarias autorizadas
-- - Departamentos / Ubicaciones preestablecidas
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- PASO 0: Asegurar columnas requeridas en el esquema
-- ----------------------------------------------------------------------------
ALTER TABLE screening_questions ADD COLUMN IF NOT EXISTS options jsonb DEFAULT '[]'::jsonb;

-- ----------------------------------------------------------------------------
-- PASO 1: Desconectar relaciones circulares temporales
-- ----------------------------------------------------------------------------
UPDATE servicios SET servicio_previo_id = NULL WHERE servicio_previo_id IS NOT NULL;
UPDATE candidate_screenings SET promoted_employee_id = NULL WHERE promoted_employee_id IS NOT NULL;
UPDATE group_service_requests SET service_id = NULL WHERE service_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- PASO 2: Limpieza de Servicios Grupales y Transacciones de Liquidación
-- ----------------------------------------------------------------------------
TRUNCATE TABLE service_group_audit CASCADE;
TRUNCATE TABLE group_service_request_selections CASCADE;
TRUNCATE TABLE group_service_requests CASCADE;
TRUNCATE TABLE trip_passengers CASCADE;
TRUNCATE TABLE service_participants CASCADE;
TRUNCATE TABLE service_payments CASCADE;

TRUNCATE TABLE liquidation_payments CASCADE;
TRUNCATE TABLE liquidation_audit_log CASCADE;
TRUNCATE TABLE liquidation_debts CASCADE;
TRUNCATE TABLE liquidation_records CASCADE;
TRUNCATE TABLE employee_weekly_settlements CASCADE;
TRUNCATE TABLE driver_settlements CASCADE;
TRUNCATE TABLE employee_cash_payment_allocations CASCADE;
TRUNCATE TABLE employee_cash_payments CASCADE;
TRUNCATE TABLE employee_cash_obligations CASCADE;

-- ----------------------------------------------------------------------------
-- PASO 3: Limpieza de Disciplina, Reportes y Ratings vinculados a servicios
-- ----------------------------------------------------------------------------
TRUNCATE TABLE interaction_ratings CASCADE;
TRUNCATE TABLE conduct_reports CASCADE;
TRUNCATE TABLE disciplinary_sanctions CASCADE;
TRUNCATE TABLE employee_report_history CASCADE;
TRUNCATE TABLE employee_reports CASCADE;

-- ----------------------------------------------------------------------------
-- PASO 4: Limpieza de Viajes, Extensiones, Extras y Comprobantes de Servicios
-- ----------------------------------------------------------------------------
TRUNCATE TABLE viajes CASCADE;
TRUNCATE TABLE extensiones_servicio CASCADE;
TRUNCATE TABLE extras_servicio CASCADE;
TRUNCATE TABLE prorrogas CASCADE;
TRUNCATE TABLE payment_receipt_validations CASCADE;
TRUNCATE TABLE loyalty_transactions CASCADE;

-- ----------------------------------------------------------------------------
-- PASO 5: Limpieza de Servicios
-- ----------------------------------------------------------------------------
TRUNCATE TABLE servicios CASCADE;

-- ----------------------------------------------------------------------------
-- PASO 6: Limpieza de Conversaciones de Telegram, Sesiones y Alertas
-- ----------------------------------------------------------------------------
TRUNCATE TABLE conversaciones_telegram CASCADE;
TRUNCATE TABLE telegram_sessions CASCADE;
TRUNCATE TABLE alertas_clientes CASCADE;

-- ----------------------------------------------------------------------------
-- PASO 7: Limpieza de Evaluaciones de Candidatas (Screening)
-- ----------------------------------------------------------------------------
TRUNCATE TABLE candidate_screening_answers CASCADE;
TRUNCATE TABLE candidate_screenings CASCADE;
-- NOTA: "screening_questions" NO se borra para conservar tu banco de preguntas.

-- ----------------------------------------------------------------------------
-- PASO 8: Limpieza de Clientes de Prueba (Opcional, clientes que no tengan historial)
-- ----------------------------------------------------------------------------
TRUNCATE TABLE client_memberships CASCADE;
TRUNCATE TABLE clientes CASCADE;

-- ----------------------------------------------------------------------------
-- PASO 9: Borrado Selectivo de Modelos Específicas: 'perzi', 'Mike', 'Perzi'
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    emp_record RECORD;
BEGIN
    FOR emp_record IN 
        SELECT id, usuario_id, nombre_artistico, nombre_real 
        FROM empleadas 
        WHERE LOWER(nombre_artistico) = ANY(ARRAY['perzi', 'mike']) 
           OR LOWER(nombre_real) = ANY(ARRAY['perzi', 'mike'])
           OR LOWER(slug_catalogo) = ANY(ARRAY['perzi', 'mike'])
    LOOP
        RAISE NOTICE 'Eliminando modelo: % (Real: %, ID: %)', emp_record.nombre_artistico, emp_record.nombre_real, emp_record.id;
        
        -- Borrar fotos asociadas y registros de la modelo
        DELETE FROM empleada_fotos WHERE empleada_id = emp_record.id;
        DELETE FROM empleada_fotos_exclusivas WHERE empleada_id = emp_record.id;
        DELETE FROM weekly_photo_submissions WHERE empleada_id = emp_record.id;
        DELETE FROM weekly_content_schedules WHERE empleada_id = emp_record.id;
        DELETE FROM extras_catalogo WHERE empleada_id = emp_record.id;
        
        -- Borrar intentos de cuestionario de onboarding
        DELETE FROM questionnaire_answers WHERE attempt_id IN (
            SELECT qa.id FROM questionnaire_attempts qa
            JOIN employee_onboardings eo ON qa.onboarding_id = eo.id
            WHERE eo.employee_id = emp_record.id OR (emp_record.usuario_id IS NOT NULL AND eo.user_id = emp_record.usuario_id)
        );
        DELETE FROM questionnaire_attempts WHERE onboarding_id IN (
            SELECT id FROM employee_onboardings 
            WHERE employee_id = emp_record.id OR (emp_record.usuario_id IS NOT NULL AND user_id = emp_record.usuario_id)
        );
        DELETE FROM employee_onboardings WHERE employee_id = emp_record.id OR (emp_record.usuario_id IS NOT NULL AND user_id = emp_record.usuario_id);
        
        -- Borrar empleada
        DELETE FROM empleadas WHERE id = emp_record.id;
        
        -- Borrar usuario asociado si existe
        IF emp_record.usuario_id IS NOT NULL THEN
            DELETE FROM usuarios WHERE id = emp_record.usuario_id;
        END IF;
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- PASO 10: Resetear Disponibilidad de las Modelos Conservadas
-- ----------------------------------------------------------------------------
UPDATE empleadas 
SET disponible = true 
WHERE catalogo_activo = true;

COMMIT;

-- ============================================================================
-- INSTRUCCIONES PARA EJECUTAR EN TU VPS (HOSTINGER DOCKER):
-- ============================================================================
-- 1. Conéctate por SSH a tu VPS:
--    ssh root@<IP_DE_TU_VPS>
--
-- 2. Ejecuta:
--    docker compose exec -T db psql -U "$DATABASE_USER" -d "$DATABASE_NAME" < clean_production.sql
-- ============================================================================
