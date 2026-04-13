import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "mezzi.s3.us-east-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "fincasya.s3.us-east-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "tough-butterfly-537.convex.cloud",
        pathname: "/api/storage/**",
      },
      {
        protocol: "https",
        hostname: "instagram.fvvc1-1.fna.fbcdn.net",
      },
      {

        protocol: "https",
        hostname: "media-cdn.tripadvisor.com",
      }
    ],
  },
  webpack: (config) => {
    // Evita que Next intente cargar el binario nativo de `canvas` en tiempo de compilación.
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
