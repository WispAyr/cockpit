import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@cockpit/schema"],
};
export default config;
