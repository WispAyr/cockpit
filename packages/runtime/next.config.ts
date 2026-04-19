import type { NextConfig } from "next";

const GO2RTC_URL = process.env.GO2RTC_URL ?? "http://127.0.0.1:1984";

const config: NextConfig = {
  transpilePackages: ["@cockpit/schema"],
  async rewrites() {
    return [
      // Camera HLS / MSE streams proxied through the runtime so widgets can
      // use a relative URL regardless of where go2rtc is bound.
      { source: "/stream/:slug.m3u8", destination: `${GO2RTC_URL}/api/stream.m3u8?src=:slug` },
      { source: "/stream/:slug.mp4", destination: `${GO2RTC_URL}/api/stream.mp4?src=:slug` },
      { source: "/stream/:slug/frame.jpg", destination: `${GO2RTC_URL}/api/frame.jpeg?src=:slug` },
      // go2rtc admin/info API (optional use by widgets needing a stream list)
      { source: "/go2rtc/streams", destination: `${GO2RTC_URL}/api/streams` },
    ];
  },
};

export default config;
