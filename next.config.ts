import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async redirects() {
    return [
      {
        source: "/brissac",
        destination:
          "https://my.weezevent.com/double-anniversaire-50-ans-du-garage-5-ans-de-brissac-automobiles",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
