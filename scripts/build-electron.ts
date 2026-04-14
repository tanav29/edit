import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["electron/main.ts", "electron/preload.ts"],
  bundle: true,
  platform: "node",
  outdir: "electron/dist",
  format: "cjs",
  external: ["electron"],
});

console.log("Electron build complete");