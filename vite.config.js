import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/__curl_proxy": {
        target: "http://api-his.bvnhietdoi.com.vn",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__curl_proxy/, ""),
      },
    },
  },
});
