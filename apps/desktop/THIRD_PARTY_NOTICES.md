# Desktop dependencies

Original project code is MIT licensed; see the repository LICENSE. Runtime dependencies retain their own licenses. The package includes copies in `resources/app.asar/licenses` and Electron's distribution notices.

| Dependency | Version | License / source |
| --- | --- | --- |
| Electron | 45.2.3 | MIT and bundled Chromium / Node notices, https://github.com/electron/electron |
| React / React DOM | 19.3.1 | MIT, https://github.com/facebook/react |
| ws | 8.22.1 | MIT, https://github.com/websockets/ws |
| qrcode | 1.5.4 | MIT, https://github.com/soldair/node-qrcode |
| SQLite | Electron bundled 3.53.4 | Public domain; node:sqlite uses the bundled runtime |

Build-only dependencies: TypeScript (Apache-2.0), Vite (MIT), esbuild (MIT), @electron/packager (BSD-2-Clause), Prettier (MIT), and the corresponding type declarations. Locked versions are in pnpm-lock.yaml. No external fonts, images, pose model, or LLM weights are shipped in this desktop package.
