/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["unpdf", "mammoth"],
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};
export default nextConfig;
