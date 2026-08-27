import path from "node:path";
import { deriveSourceProvenance } from "./scripts/clover-deployment-attestation.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const buildProvenance = deriveSourceProvenance({ repositoryRoot });

const securityHeaders = [
  { key: "Content-Security-Policy", value: "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data:; media-src 'none'; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; upgrade-insecure-requests" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  deploymentId: buildProvenance.runtimeDeploymentKey,
  env: {
    CLOVER_BUILD_PROVENANCE_JSON: JSON.stringify(buildProvenance)
  },
  outputFileTracingRoot: repositoryRoot,
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: repositoryRoot },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

export default nextConfig;
