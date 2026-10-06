# Benchmark de la migración del núcleo operativo

Migración: `1810000000000-CreateServiceOperationsCore.ts`. Fecha: 2026-10-05.

## Entorno y método

- PostgreSQL 16 Alpine en un contenedor local efímero, sin datos ni credenciales de producción.
- Esquema creado con todas las migraciones; después se ejecutó `down()` de esta migración para conservar un esquema anterior compatible.
- Servicios sintéticos con relaciones válidas y distribución uniforme entre `pendiente`, `agendado`, `en_curso`, `finalizado` y `cancelado`.
- Una ejecución por escala. Los tiempos son orientativos del entorno Cloud, no un SLA.
- Para medir fases se ejecutaron las consultas de `up()` por separado. En despliegue TypeORM envuelve la migración completa en una transacción (`migrationsTransactionMode: each`), por lo que los locks pueden mantenerse hasta el commit final.

## Resultados

| Servicios | Total | Backfill | ADD columnas | DEFAULT + NOT NULL | CHECK | Índices | Tabla/event indexes | Tamaño antes / después |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 78.7 ms | 49.6 ms | 2.9 ms | 2.6 ms | 5.3 ms | 7.4 ms | 10.7 ms | 0.47 / 0.91 MiB |
| 10,000 | 432.2 ms | 378.4 ms | 7.5 ms | 8.3 ms | 7.6 ms | 18.0 ms | 12.2 ms | 4.20 / 7.18 MiB |
| 50,000 | 2,775.6 ms | 2,594.0 ms | 6.7 ms | 46.0 ms | 35.4 ms | 76.6 ms | 16.7 ms | 23.20 / 39.78 MiB |

## Integridad y bloqueo

En las tres escalas:

- el conteo antes/después fue idéntico;
- `estado` histórico y su distribución no cambiaron;
- cero `estado_operativo` nulos;
- cero diferencias contra el mapeo determinista esperado;
- cuatro índices esperados presentes;
- `chk_servicios_estado_operativo` presente y validado;
- una segunda invocación directa de `up()` no alteró datos (5.4–38.2 ms);
- la tabla `migrations` conservó una sola fila para la migración, por lo que el runner no la aplica dos veces.

El observador de `pg_locks` capturó `AccessExclusiveLock`, `RowExclusiveLock`, `ShareLock` y `ShareRowExclusiveLock` sobre `servicios`. No hubo espera por otro proceso en esta base aislada. En una ejecución real, el primer `ALTER TABLE` puede bloquear lecturas/escrituras incompatibles durante toda la transacción; a 50k filas el periodo medido fue de aproximadamente 2.8 s sin carga concurrente.

## Recomendación

El comportamiento hasta 50k servicios es lineal y aceptable, y no justifica reescribir la migración. Sí recomiendo ejecutarla primero en staging/restauración reciente y luego en una ventana de baja actividad, verificando antes el conteo real y sesiones largas sobre `servicios`. No recomiendo ejecutarla todavía en producción sin completar QA manual, backup comprobado y observación de locks de la base real.

Rollback elimina únicamente la tabla/columnas creadas por esta migración; por definición descarta eventos operativos escritos después de aplicarla. Por eso solo es seguro como rollback inmediato previo a tráfico nuevo, no como reversión tardía.
