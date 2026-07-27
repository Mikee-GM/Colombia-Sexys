# Frontend

Aplicación Next.js del monorepo Colombia Sexys. La instalación, variables,
Docker y despliegue se documentan en el `README.md` de la raíz.

El frontend no accede directamente a PostgreSQL ni a R2. Toda persistencia,
autenticación y subida de archivos se realiza mediante el backend NestJS.
