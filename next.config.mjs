/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output lets the Docker image ship only the server it needs —
  // a small image matters on Fly.io's free-tier VMs.
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;
