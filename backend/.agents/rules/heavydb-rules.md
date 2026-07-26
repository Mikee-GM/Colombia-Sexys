---
trigger: always_on
---

## 1. Reglas Críticas de Base de Datos y Precisión

- **Campos Financieros (Exactitud):**
  - Cualquier campo monetario o financiero debe utilizar tipos de datos de precisión exacta en PostgreSQL: `numeric` o `decimal`.
  - En TypeORM, decorarse explícitamente:
    ```typescript
    @Column({ type: 'numeric', precision: 12, scale: 2, transformer: new ColumnNumericTransformer() })
    total: number;
    ```
  - _Nota:_ Utilizar siempre un transformador para convertir el string devuelto por la base de datos a un número en TypeScript.

- **Fechas y Horas con Zona Horaria Nativa:**
  - Todos los campos de fecha y hora deben registrar zona horaria. Utilizar `timestamptz` en la base de datos.
  - En TypeORM:
    ```typescript
    @Column({ type: 'timestamptz' })
    fechaRegistro: Date;
    ```

- **IDs de Chat de Telegram:**
  - Las IDs de Telegram deben almacenarse en la base de datos como `bigint`.
  - En JavaScript/TypeScript, deben mapearse como `string` para evitar pérdida de precisión por el límite `Number.MAX_SAFE_INTEGER`.
  - En TypeORM:
    ```typescript
    @Column({ type: 'bigint' })
    @Index()
    clienteTelegramId: string;
    ```

## 2. Roles, Seguridad y Perfiles

- **Entidad Usuario Unificada:**
  - Toda credencial, autenticación, estado general y rol (Admin, Jefe, Empleada, Chofer) reside en la tabla central `Usuario`.
- **Perfiles Especializados:**
  - Los roles específicos que requieran atributos adicionales (`Empleada`, `Chofer`) se asocian a `Usuario` mediante relaciones 1:1 (`OneToOne`) con llave foránea en el perfil específico.
  - Ejemplo: `Chofer` tiene `@OneToOne(() => Usuario) @JoinColumn()`

## 3. Lógica Automatizada ("Heavy DB")

- **Cálculos Financieros:**
  - Los cálculos agregados (por ejemplo, el cálculo del total de un servicio al agregar extras) deben ocurrir en PostgreSQL a través de Triggers o Funciones.
  - El backend no calcula estos totales en memoria; delega la inserción y recarga la entidad o recibe el valor calculado de la base de datos.
- **Procesos Matemáticos/Geográficos Complejos:**
  - Cálculos como la fórmula de Haversine para geolocalización de choferes más cercanos deben implementarse en funciones de PostgreSQL (PL/pgSQL) y llamarse desde los repositorios de NestJS.

## 4. Control de Cambios (Migrations de TypeORM)

- Cualquier cambio estructural de base de datos (tablas, columnas, índices, tipos, funciones PL/pgSQL, triggers) debe implementarse únicamente a través de migraciones autoejecutables en TypeORM utilizando SQL nativo en los métodos `up` y `down`.
- No se permite la sincronización automática de esquemas en producción (`synchronize: false`).
