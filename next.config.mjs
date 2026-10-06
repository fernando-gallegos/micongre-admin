import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
};

// Permite que getCloudflareContext() (bindings D1, secretos de .dev.vars)
// funcione también bajo `next dev`, no solo bajo `wrangler dev`.
initOpenNextCloudflareForDev();

export default nextConfig;
