/**
 * Pruebas del frontend.
 *
 * Hasta ahora este paquete no tenia ninguna, y ahi se concentraron tres fallos
 * seguidos que ni la compilacion ni los tipos veian: el prefijo de version mal
 * formado, una ruta propia fuera de las exclusiones y la doble codificacion de
 * las cookies firmadas. Los tres viven en `middleware.ts`, que es codigo puro
 * de enrutado --entra una peticion, sale una respuesta-- y por tanto se puede
 * probar sin navegador ni servidor.
 *
 * Entorno `node` a proposito: lo que se prueba no toca el DOM. El dia que haga
 * falta probar un componente, ese fichero pedira su propio entorno.
 */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["<rootDir>/**/*.spec.ts", "<rootDir>/**/*.spec.tsx"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  transform: {
    "^.+\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
  // El mismo alias que declara tsconfig.json; jest no lo lee de ahi.
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
};
