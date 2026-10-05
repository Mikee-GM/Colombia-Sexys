# Revisión de dependencias de producción

Fecha: 2026-10-05. Alcance: `pnpm audit --prod` del lockfile raíz, 525 dependencias antes del ajuste. No se usó `audit fix --force` ni se hizo ningún upgrade mayor.

## Resultado

- Antes: 18 advisories (8 altas, 7 moderadas, 3 bajas).
- Después: 0 advisories en 518 dependencias de producción.
- Clasificación de los 18 hallazgos: 7 A, 4 B, 7 C y 0 D.
- Directos: 4 advisories (`joi`, TypeORM). Transitivos: 14 advisories.
- Los 18 quedaron corregidos mediante patch/minor. La suite completa debe seguir siendo la condición para conservar estos cambios.

Clasificación: **A** explotable/relevante; **B** presente pero difícilmente alcanzable; **C** transitiva/sin uso en el flujo; **D** requiere upgrade mayor y se pospone.

## Análisis por advisory

| Advisory | Paquete y versión anterior | Origen | Uso y superficie real | Sev. | Corrección aplicada | Cambio / riesgo | Clase |
|---|---|---|---|---|---|---|---|
| GHSA-wc9g-mqfw-jrwm | `multer` 2.2.0 | Transitiva de `@nestjs/platform-express` | Runtime. `FileInterceptor`/`FilesInterceptor` reciben multipart en upload, comprobantes y fotos; nombres de campos manipulados podían causar DoS. | Alta | 2.4.0 (mín. 2.3.0) | Minor; bajo-medio, interceptores públicos sin cambios y cubiertos por build/tests. | A |
| GHSA-qfvm-cv95-jqjf | `multer` 2.2.0 | Transitiva de `@nestjs/platform-express` | Runtime. Un cliente podía abortar subidas repetidamente y agotar descriptores. | Alta | 2.4.0 (mín. 2.3.0) | Minor; bajo-medio. | A |
| GHSA-535w-7cp7-47q4 | `multer` 2.2.0 | Transitiva de `@nestjs/platform-express` | Runtime. Multipart con índices sobredimensionados podía provocar DoS. | Alta | 2.4.0 (mín. 2.3.0) | Minor; bajo-medio. | A |
| GHSA-3pph-fpjx-jg34 | `multer` 2.2.0 | Transitiva de `@nestjs/platform-express` | Runtime. Subidas abortadas podían dejar escrituras huérfanas; las rutas usan memoria/R2, pero el parser vulnerable sí está expuesto. | Moderada | 2.4.0 | Minor; bajo-medio. | A |
| GHSA-qvfw-j98x-7q72 | `multer` 2.2.0 | Transitiva de `@nestjs/platform-express` | Runtime. Carrera en `fileFilter` podía eludir el límite; las rutas aplican límites explícitos. | Baja | 2.4.0 (mín. 2.3.0) | Minor; bajo-medio. | A |
| GHSA-x5fp-wj9c-mxmx | `qs` 6.15.3 | Transitiva de Express vía `@nestjs/platform-express` | Runtime HTTP. Consultas con claves bracket/comma podían eludir límites y elevar consumo. | Moderada | 6.16.0 | Minor; bajo, API compatible de Express. | A |
| GHSA-4mjr-xmp4-gh2g | `qs` 6.15.3 | Transitiva de Express vía `@nestjs/platform-express` | Runtime HTTP. Entrada de query especialmente construida podía causar DoS en el parser. | Moderada | 6.16.0 | Minor; bajo. | A |
| GHSA-6h2x-m376-mqjq | `joi` 18.2.3 | Directa | Runtime solo al validar variables al arrancar. La aplicación no usa `string().isoDate()` y el atacante HTTP no controla este esquema. | Alta | 18.2.9 (mín. 18.2.6) | Patch; bajo. | B |
| GHSA-6w3j-5fw6-r9vr | `joi` 18.2.3 | Directa | Runtime de configuración; no se usan mensajes personalizados controlados externamente. | Baja | 18.2.9 (mín. 18.2.5) | Patch; bajo. | B |
| GHSA-gg4h-3hg2-grpc | `joi` 18.2.3 | Directa | Runtime de configuración; el esquema no usa `object().rename()` con plantilla. | Baja | 18.2.9 (mín. 18.2.4) | Patch; bajo. | B |
| GHSA-2rp8-mm9q-fp49 | TypeORM 1.0.0 | Directa | CLI de desarrollo: inyección al generar código de migración con nombres maliciosos. No participa en solicitudes ni en `migration:run`. | Moderada | 1.1.1 (mín. 1.1.0) | Minor; medio por amplitud del ORM, mitigado por unit/E2E/build y sin cambio de API usada. | B |
| GHSA-pm4m-ph32-ghv5 | `js-yaml` 5.2.1 | Transitiva de `@nestjs/swagger` | Swagger se habilita fuera de producción, pero la aplicación genera JSON y no analiza YAML no confiable. | Alta | 5.4.2 (mín. 5.2.2) | Minor; bajo, API usada indirectamente. | C |
| GHSA-r3ph-w7gj-g6xm | `js-yaml` 5.2.1 | Transitiva de `@nestjs/swagger` | Igual que la anterior; no existe endpoint que acepte YAML. | Moderada | 5.4.2 (mín. 5.4.1) | Minor; bajo. | C |
| GHSA-qx2v-qp2m-jg93 | `postcss` 8.4.31 | Transitiva fijada por Next 15.5 | Build del frontend; no se procesa CSS suministrado por usuarios en runtime. | Moderada | 8.5.23 (mín. 8.5.10) | Minor por override; medio-bajo, requiere build Next exitoso. | C |
| GHSA-6g55-p6wh-862q | `postcss` 8.4.31 | Transitiva fijada por Next 15.5 | Build local/CI; no hay `sourceMappingURL` de CSS no confiable. | Alta | 8.5.23 (mín. 8.5.12) | Minor por override; medio-bajo. | C |
| GHSA-r28c-9q8g-f849 | `postcss` 8.4.31 | Transitiva fijada por Next 15.5 | Build local/CI; lectura de source maps no es alcanzable desde tráfico web. | Alta | 8.5.23 (mín. 8.5.18) | Minor por override; medio-bajo. | C |
| GHSA-fxqj-rqcc-2cmp | `postcss` 8.4.31 | Transitiva fijada por Next 15.5 | Build local/CI; misma superficie de source maps. | Moderada | 8.5.23 | Minor por override; medio-bajo. | C |
| GHSA-2v37-7h3g-55p8 | `nanoid` 3.3.16 | Transitiva de PostCSS/Tailwind | Build. La aplicación no llama generadores personalizados con tamaño cero. | Alta | 3.3.18 | Patch; bajo. | C |

## Justificación de versiones

Los overrides se limitaron a `multer` 2.4.0, `qs` 6.16.0, `js-yaml` 5.4.2, `postcss` 8.5.23 y `nanoid` 3.3.18. Las directas pasaron a `joi` 18.2.9 y TypeORM 1.1.1. No se cambió Next, Nest ni ninguna dependencia a una versión mayor. Un `pnpm audit --prod --json` posterior informa cero vulnerabilidades.

`postcss` merece vigilancia especial: Next 15.5.27 todavía declara 8.4.31, por lo que se usa un override minor. Si un build futuro falla, no debe retirarse silenciosamente; se debe actualizar Next a una línea que incorpore el fix o revisar el override con la matriz de compatibilidad.
