import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// All routes are force-dynamic — no ISR needed, use dummy cache
export default defineCloudflareConfig({
  incrementalCache: "dummy",
});
