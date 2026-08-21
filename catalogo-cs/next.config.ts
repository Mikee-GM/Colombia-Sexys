import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, ".."),
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  eslint: {
    // TODO: poner en false. Sigue activo solo porque falta instalar
    // `eslint-plugin-react-hooks` (ya declarado en devDependencies): hasta que
    // se ejecute `pnpm install`, `next lint` no arranca. Despues de instalar y
    // ver el lint en verde, quitar esta bandera para que el build lo valide.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.r2.dev",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.cloudflare.com",
        pathname: "/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [128, 256, 384],
    minimumCacheTTL: 31536000,
  },
};

export default nextConfig;
