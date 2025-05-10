import { defineConfig } from "tsup"

export default defineConfig({
  clean: true,
  entry: {
    index: "src/index.ts",
  },
  format: ["esm"],
  minify: true,
  outDir: "dist",
})
