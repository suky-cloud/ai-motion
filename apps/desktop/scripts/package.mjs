import { packager } from "@electron/packager";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
const local = resolve("../../.local");
mkdirSync(local, { recursive: true });
const stage = mkdtempSync(join(local, "desktop-package-"));
// All runtime dependencies are bundled. Stage only reviewed output, never a pnpm symlink tree or local data.
cpSync("dist", join(stage, "dist"), { recursive: true });
cpSync("dist-main", join(stage, "dist-main"), { recursive: true });
mkdirSync(join(stage, "licenses"));
for (const name of ["react", "react-dom", "ws", "qrcode"])
  cpSync(
    `node_modules/${name}/${name === "qrcode" ? "license" : "LICENSE"}`,
    join(stage, "licenses", `${name}.txt`),
  );
cpSync("../../LICENSE", join(stage, "licenses", "AI-Motion.txt"));
cpSync(
  "THIRD_PARTY_NOTICES.md",
  join(stage, "licenses", "THIRD_PARTY_NOTICES.md"),
);
writeFileSync(
  join(stage, "package.json"),
  JSON.stringify({
    name: "ai-motion-desktop",
    productName: "AI Motion",
    version: "0.3.0",
    main: "dist-main/main.cjs",
  }),
);
const result = await packager({
  dir: stage,
  out: join(local, "desktop"),
  name: "AI Motion",
  executableName: "AI-Motion",
  platform: "win32",
  arch: "x64",
  electronVersion: "45.2.3",
  overwrite: true,
  asar: true,
  prune: false,
});
console.log(result.join("\n"));
