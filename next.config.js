/**
 * 部署在 Cloudflare Pages，站台位於網域根目錄，
 * 因此不需要 basePath（GitHub Pages 那種 /repo-name 前綴才需要）。
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
