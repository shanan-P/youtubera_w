// This is the configuration file for the Remix application.
// It contains settings for the application, such as ignored routes and future flags.
import type { AppConfig } from "@remix-run/dev";

export default {
  ignoredRouteFiles: ["**/*.test.*", "**/*.spec.*"],
  future: {
    v3_singleFetch: true,
    v3_throwAbortReason: true,
    v3_fetcherPersist: true,
  },
  browserNodeBuiltinsPolyfill: {
    modules: {
      fs: true,
      path: true,
    },
  },
} satisfies AppConfig;
