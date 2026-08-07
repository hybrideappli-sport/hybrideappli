import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Packages internes du monorepo (ADR-003) : ils exportent leurs sources
  // TypeScript directement (pas de build préalable), Next.js doit donc les
  // transpiler lui-même.
  transpilePackages: [
    "@hybride/domain",
    "@hybride/rules-engine",
    "@hybride/coach-llm",
    "@hybride/db",
  ],
};

export default nextConfig;
