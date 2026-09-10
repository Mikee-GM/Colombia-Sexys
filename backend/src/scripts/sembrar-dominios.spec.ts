import * as fs from 'fs';
import * as path from 'path';
import type { QueryRunner } from 'typeorm';

import { sembrar } from './sembrar-datos-demo';

/**
 * Comprueba que los VALORES de la siembra caben en su columna.
 *
 * El spec de al lado ya verifica que las columnas existan y que las
 * obligatorias vayan rellenas, y dice de si mismo que los CHECK y los enums
 * "solo se prueban de verdad contra PostgreSQL". Ese hueco costo caro: el
 * script llevaba tiempo sin poder insertar ni el segundo usuario, y como nadie
 * lo ejecutaba en una base con el esquema al dia, no fallaba en ninguna prueba.
 * Entre lo que se encontro al arreglarlo habia veintitres valores fuera de su
 * dominio, tres tipos equivocados y un codigo repetido en una columna unica.
 *
 * Aqui los dominios se leen de las dos fuentes que los declaran --las entidades
 * y los CHECK de las migraciones-- y se contrastan con lo que la siembra
 * escribe. No cubre todo lo que cubre Postgres, pero si la familia entera de
 * fallos que se colo.
 */

const RAIZ = path.resolve(__dirname, '..');

function archivosQueTerminanEn(sufijo: string): string[] {
  const encontrados: string[] = [];
  const recorrer = (dir: string): void => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completa = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(completa);
      else if (entrada.name.endsWith(sufijo)) encontrados.push(completa);
    }
  };
  recorrer(RAIZ);
  return encontrados;
}

type Dominios = Map<string, Map<string, Set<string>>>;

function anotar(
  dominios: Dominios,
  tabla: string,
  columna: string,
  valores: string[],
): void {
  if (!valores.length) return;
  if (!dominios.has(tabla)) dominios.set(tabla, new Map());
  const deLaTabla = dominios.get(tabla)!;
  if (!deLaTabla.has(columna)) deLaTabla.set(columna, new Set());
  for (const valor of valores) deLaTabla.get(columna)!.add(valor);
}

/** `@Column('enum', { name: 'estado', enum: ['a', 'b'] })` de las entidades. */
function dominiosDeLasEntidades(dominios: Dominios): void {
  for (const archivo of archivosQueTerminanEn('.entity.ts')) {
    const fuente = fs.readFileSync(archivo, 'utf8');
    const cabeceras = [...fuente.matchAll(/@Entity\((?:'|")([^'"]+)/g)];
    for (let i = 0; i < cabeceras.length; i += 1) {
      const tabla = cabeceras[i][1];
      const trozo = fuente.slice(
        cabeceras[i].index ?? 0,
        cabeceras[i + 1]?.index ?? fuente.length,
      );
      for (const col of trozo.matchAll(
        /@Column\(\s*'enum',\s*\{([\s\S]*?)\}\s*\)/g,
      )) {
        const cuerpo = col[1];
        const nombre = /name:\s*'([^']+)'/.exec(cuerpo)?.[1];
        const lista = /enum:\s*\[([\s\S]*?)\]/.exec(cuerpo)?.[1];
        if (!nombre || !lista) continue;
        anotar(
          dominios,
          tabla,
          nombre,
          [...lista.matchAll(/'([^']*)'/g)].map((m) => m[1]),
        );
      }
    }
  }
}

/** `CHECK (columna IN ('a', 'b'))` de las migraciones. */
function dominiosDeLasMigraciones(dominios: Dominios): void {
  for (const archivo of archivosQueTerminanEn('.ts')) {
    if (!archivo.includes('migrations')) continue;
    const fuente = fs.readFileSync(archivo, 'utf8');
    /*
     * Se busca la tabla en el mismo `ALTER TABLE` que trae el CHECK. Solo se
     * miran las restricciones de una columna con una lista literal, que son las
     * que declaran un dominio; las compuestas --"si el estado es cerrado, el
     * desenlace no puede ser nulo"-- necesitan evaluar la fila entera y quedan
     * fuera a proposito.
     */
    for (const bloque of fuente.matchAll(
      /ALTER TABLE\s+(?:public\.)?"?([a-z_0-9]+)"?([\s\S]{0,600}?)CHECK\s*\(([\s\S]{0,400}?)\)`/g,
    )) {
      const tabla = bloque[1];
      const condicion = bloque[3];
      const simple =
        /"?([a-z_0-9]+)"?\s+IN\s*\(([^)]*)\)\s*\)?\s*$/i.exec(condicion) ??
        /"?([a-z_0-9]+)"?\s+IN\s*\(([^)]*)\)/i.exec(condicion);
      if (!simple) continue;
      anotar(
        dominios,
        tabla,
        simple[1],
        [...simple[2].matchAll(/'([^']*)'/g)].map((m) => m[1]),
      );
    }
  }
}

/** `QueryRunner` de mentira que apunta tabla, columnas y VALORES. */
function runnerQueApunta(): {
  qr: QueryRunner;
  filas: { tabla: string; fila: Record<string, unknown> }[];
} {
  const filas: { tabla: string; fila: Record<string, unknown> }[] = [];
  const qr = {
    query: (sql: string, parametros?: unknown[]) => {
      const insert = /INSERT INTO "([^"]+)" \(([^)]*)\)/.exec(sql);
      if (insert && parametros) {
        const columnas = insert[2]
          .split(',')
          .map((c) => c.trim().replace(/"/g, ''))
          .filter(Boolean);
        const fila: Record<string, unknown> = {};
        columnas.forEach((c, i) => (fila[c] = parametros[i]));
        filas.push({ tabla: insert[1], fila });
      }
      return Promise.resolve([]);
    },
  } as unknown as QueryRunner;
  return { qr, filas };
}

describe('Los valores de la siembra caben en su columna', () => {
  const dominios: Dominios = new Map();
  dominiosDeLasEntidades(dominios);
  dominiosDeLasMigraciones(dominios);

  let filas: { tabla: string; fila: Record<string, unknown> }[];

  beforeAll(async () => {
    const { qr, filas: registradas } = runnerQueApunta();
    await sembrar(qr);
    filas = registradas;
  });

  it('encuentra dominios que contrastar', () => {
    // Si el parseo se rompe, el resto de las pruebas pasarian sin comprobar
    // nada. Esto es lo que evita que se vuelvan decorativas.
    expect(dominios.size).toBeGreaterThan(5);
  });

  it('no escribe ningún valor fuera del dominio de su columna', () => {
    const fuera: string[] = [];
    for (const { tabla, fila } of filas) {
      const deLaTabla = dominios.get(tabla);
      if (!deLaTabla) continue;
      for (const [columna, valor] of Object.entries(fila)) {
        if (typeof valor !== 'string') continue;
        const permitidos = deLaTabla.get(columna);
        if (permitidos && !permitidos.has(valor)) {
          fuera.push(
            `${tabla}.${columna} = '${valor}' (permitidos: ${[...permitidos].sort().join(', ')})`,
          );
        }
      }
    }
    expect(fuera).toEqual([]);
  });

  /**
   * `card_amounts` se sembró como el número `900` en una columna `jsonb` que
   * el código recorre con `.reduce`. Postgres lo acepta --un número suelto es
   * JSON válido-- y el 500 salía después, en tres pantallas de dinero a la vez.
   */
  it('escribe las columnas jsonb como JSON serializado', () => {
    const jsonPorTabla = new Map<string, Set<string>>();
    for (const archivo of archivosQueTerminanEn('.entity.ts')) {
      const fuente = fs.readFileSync(archivo, 'utf8');
      const cabeceras = [...fuente.matchAll(/@Entity\((?:'|")([^'"]+)/g)];
      for (let i = 0; i < cabeceras.length; i += 1) {
        const tabla = cabeceras[i][1];
        const trozo = fuente.slice(
          cabeceras[i].index ?? 0,
          cabeceras[i + 1]?.index ?? fuente.length,
        );
        for (const col of trozo.matchAll(
          /@Column\(\s*(?:'jsonb'|\{[^}]*type:\s*'jsonb')[\s\S]{0,200}?\}\s*\)\s*(?:@[\s\S]*?)??\s*([a-zA-Z0-9_]+)[?!]?\s*:/g,
        )) {
          const propiedad = col[1];
          const nombre =
            /name:\s*'([^']+)'/.exec(col[0])?.[1] ??
            propiedad.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
          if (!jsonPorTabla.has(tabla)) jsonPorTabla.set(tabla, new Set());
          jsonPorTabla.get(tabla)!.add(nombre);
        }
      }
    }

    const malos: string[] = [];
    for (const { tabla, fila } of filas) {
      const columnas = jsonPorTabla.get(tabla);
      if (!columnas) continue;
      for (const columna of columnas) {
        const valor = fila[columna];
        if (valor === undefined || valor === null) continue;
        // Serializado quiere decir cadena; cualquier otra cosa la convierte el
        // controlador de Postgres a su manera y deja de ser el JSON esperado.
        if (typeof valor !== 'string') {
          malos.push(`${tabla}.${columna} = ${JSON.stringify(valor)}`);
        }
      }
    }
    expect(malos).toEqual([]);
  });

  /**
   * El fallo original: `telegram_verification_code` lleva un índice único
   * parcial y la siembra ponía el mismo literal a las ocho personas, así que
   * la transacción moría en el segundo INSERT.
   */
  it('no repite valores en columnas con índice único', () => {
    const unicas: [string, string][] = [
      ['usuarios', 'email'],
      ['usuarios', 'telegram_chat_id'],
      ['usuarios', 'telegram_verification_code'],
      ['empleadas', 'slug_catalogo'],
      ['clientes', 'telegram_chat_id'],
    ];
    const repetidos: string[] = [];
    for (const [tabla, columna] of unicas) {
      const vistos = new Map<unknown, number>();
      for (const { tabla: t, fila } of filas) {
        if (t !== tabla) continue;
        const valor = fila[columna];
        if (valor === null || valor === undefined) continue;
        vistos.set(valor, (vistos.get(valor) ?? 0) + 1);
      }
      for (const [valor, veces] of vistos) {
        if (veces > 1) {
          repetidos.push(`${tabla}.${columna} = '${String(valor)}' x${veces}`);
        }
      }
    }
    expect(repetidos).toEqual([]);
  });
});
