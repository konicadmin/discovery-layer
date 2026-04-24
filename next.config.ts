import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  serverExternalPackages: ["argon2", "@prisma/client"],
};

export default nextConfig;
