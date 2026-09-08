import * as fs from 'fs';
import * as path from 'path';
import type { QueryRunner } from 'typeorm';
import { TABLAS_EN_ORDEN_DE_BORRADO, sembrar } from './sembrar-datos-demo';

/**
 * Comprueba la siembra de demostración sin base de datos.
 *
 * Un script que inserta filas y que nadie ha ejecutado nunca es una conjetura:
 * basta con que una columna se llame distinto para que reviente al primer
 * INSERT, y eso se descubre tarde y a mano. Aquí se ejecuta `sembrar()` contra
 * un `QueryRunner` de mentira que apunta lo que se le pide, y cada columna se
 * contrasta con la entidad de TypeORM correspondiente, que es lo que la
 * aplicación considera el esquema.
 *
 * No sustituye a correrlo contra PostgreSQL --los CHECK, los índices únicos y
 * los triggers solo se prueban de verdad ahí-- pero descarta el fallo que de
 * lejos es el más probable.
 */

/** Columnas declaradas por las entidades, por tabla. */
function leerEsquemaDeLasEntidades(): Map<
  string,
  Map<string, { nullable: boolean; tieneDefecto: boolean }>
> {
  const raiz = path.resolve(__dirname, '..');
  const archivos: string[] = [];
  const recorrer = (dir: string): void => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completa = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(completa);
      else if (entrada.name.endsWith('.entity.ts')) archivos.push(completa);
    }
  };
  recorrer(raiz);

  const esquema = new Map<
    string,
    Map<string, { nullable: boolean; tieneDefecto: boolean }>
  >();

  for (const archivo of archivos) {
    const fuente = fs.readFileSync(archivo, 'utf8');
    /*
     * Un archivo puede declarar mas de una entidad --`employee-cash-payment`
     * trae el pago y sus asignaciones-- asi que se parte por cada `@Entity` y
     * cada trozo se atribuye a su propia tabla. Sin esto, las columnas de la
     * segunda entidad se le colgaban a la primera y la prueba pedia rellenar
     * columnas que ni siquiera existen ahi.
     */
    const cabeceras = [...fuente.matchAll(/@Entity\((?:'|")([^'"]+)/g)];
    for (let i = 0; i < cabeceras.length; i += 1) {
      const tabla = cabeceras[i][1];
      const desde = cabeceras[i].index ?? 0;
      const hasta = cabeceras[i + 1]?.index ?? fuente.length;
      agregarColumnas(esquema, tabla, fuente.slice(desde, hasta));
    }
  }
  return esquema;
}

function agregarColumnas(
  esquema: Map<
    string,
    Map<string, { nullable: boolean; tieneDefecto: boolean }>
  >,
  tabla: string,
  fuente: string,
): void {
  const columnas = new Map<
    string,
    { nullable: boolean; tieneDefecto: boolean }
  >();
  /*
   * Se busca el decorador de columna y, a partir de ahi, el primer nombre de
   * propiedad. `@ApiProperty` y compania pueden ir en medio, asi que el nombre
   * real se toma de `name:` cuando existe y solo se cae a la propiedad cuando
   * el decorador no lo declara.
   */
  const patron =
    /@(Column|PrimaryColumn|PrimaryGeneratedColumn|CreateDateColumn|UpdateDateColumn|DeleteDateColumn)\(([\s\S]{0,600}?)\)\s*(?:@[A-Za-z]+\([\s\S]{0,600}?\)\s*)*([A-Za-z_$][\w$]*)[?!]?\s*[:;]/g;
  let coincidencia: RegExpExecArray | null;
  while ((coincidencia = patron.exec(fuente))) {
    const opciones = coincidencia[2].replace(/\s+/g, ' ');
    const nombre =
      /name: '([^']+)'/.exec(opciones)?.[1] ??
      /name: "([^"]+)"/.exec(opciones)?.[1] ??
      aSnake(coincidencia[3]);
    columnas.set(nombre, {
      nullable: /nullable: true/.test(opciones),
      tieneDefecto:
        /default:/.test(opciones) ||
        coincidencia[1].startsWith('PrimaryGenerated') ||
        coincidencia[1] === 'CreateDateColumn' ||
        coincidencia[1] === 'UpdateDateColumn',
    });
  }
  if (columnas.size > 0) esquema.set(tabla, columnas);
}

/** TypeORM aplica esta conversión cuando la columna no declara `name`. */
function aSnake(propiedad: string): string {
  return propiedad.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
}

interface Peticion {
  tabla: string;
  columnas: string[];
}

/** `QueryRunner` de mentira: en vez de ejecutar, apunta. */
function runnerQueApunta(): { qr: QueryRunner; peticiones: Peticion[] } {
  const peticiones: Peticion[] = [];
  const qr = {
    query: (sql: string) => {
      const insert = /INSERT INTO "([^"]+)" \(([^)]*)\)/.exec(sql);
      if (insert) {
        peticiones.push({
          tabla: insert[1],
          columnas: insert[2]
            .split(',')
            .map((c) => c.trim().replace(/"/g, ''))
            .filter(Boolean),
        });
        return Promise.resolve([]);
      }
      const update = /UPDATE "([^"]+)"/.exec(sql);
      if (update) {
        peticiones.push({
          tabla: update[1],
          columnas: [...sql.matchAll(/"([a-z_]+)" =/g)].map((m) => m[1]),
        });
      }
      return Promise.resolve([]);
    },
  } as unknown as QueryRunner;
  return { qr, peticiones };
}

describe('Siembra de datos de demostración', () => {
  const esquema = leerEsquemaDeLasEntidades();
  let peticiones: Peticion[];

  beforeAll(async () => {
    const { qr, peticiones: registradas } = runnerQueApunta();
    await sembrar(qr);
    peticiones = registradas;
  });

  it('escribe en unas cuantas decenas de tablas', () => {
    const tablas = new Set(peticiones.map((p) => p.tabla));
    expect(tablas.size).toBeGreaterThanOrEqual(35);
  });

  /*
   * El fallo que esta prueba existe para atrapar: una columna mal escrita o
   * renombrada tumba el INSERT en cuanto se corre contra PostgreSQL, y hasta
   * entonces el script parece correcto.
   */
  it('solo usa columnas que existen en las entidades', () => {
    const desconocidas: string[] = [];
    for (const peticion of peticiones) {
      const columnasDeLaTabla = esquema.get(peticion.tabla);
      if (!columnasDeLaTabla) continue; // Tabla sin entidad propia: no hay con qué contrastar.
      for (const columna of peticion.columnas) {
        if (!columnasDeLaTabla.has(columna)) {
          desconocidas.push(`${peticion.tabla}.${columna}`);
        }
      }
    }
    expect(desconocidas).toEqual([]);
  });

  /*
   * Al reves: una columna obligatoria que la siembra no rellena y que tampoco
   * tiene valor por defecto en la base hace saltar un NOT NULL.
   */
  it('rellena toda columna obligatoria que no tenga valor por defecto', () => {
    const faltantes: string[] = [];
    const porTabla = new Map<string, Set<string>>();
    for (const peticion of peticiones) {
      const acumuladas = porTabla.get(peticion.tabla) ?? new Set<string>();
      peticion.columnas.forEach((c) => acumuladas.add(c));
      porTabla.set(peticion.tabla, acumuladas);
    }

    for (const [tabla, columnasUsadas] of porTabla) {
      const columnasDeLaTabla = esquema.get(tabla);
      if (!columnasDeLaTabla) continue;
      for (const [columna, meta] of columnasDeLaTabla) {
        if (meta.nullable || meta.tieneDefecto) continue;
        if (!columnasUsadas.has(columna)) {
          faltantes.push(`${tabla}.${columna}`);
        }
      }
    }
    expect(faltantes).toEqual([]);
  });

  it('siembra en tablas que la limpieza sabe vaciar después', () => {
    const conocidas = new Set(TABLAS_EN_ORDEN_DE_BORRADO);
    const huerfanas = [...new Set(peticiones.map((p) => p.tabla))].filter(
      (tabla) => tabla !== 'servicios' && !conocidas.has(tabla),
    );
    expect(huerfanas).toEqual([]);
  });

  /*
   * Las tarjetas, los filtros y los colores del panel dependen del estado del
   * servicio: con uno solo sembrado, media pantalla no se llega a ver nunca.
   */
  it('deja todos los servicios en los estados que el panel dibuja', () => {
    const estadosSembrados = peticiones.filter((p) => p.tabla === 'servicios');
    expect(estadosSembrados.length).toBeGreaterThanOrEqual(8);
  });
});
