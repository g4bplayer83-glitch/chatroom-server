"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const {spawn, spawnSync} = require("node:child_process");
const root = path.resolve(__dirname, "..");
process.chdir(root);
if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error("DocSpace demande Node.js 22 ou plus récent. Installe-le puis relance ce fichier.");
  process.exit(1);
}
const lock = crypto.createHash("sha256").update(fs.readFileSync("package-lock.json")).digest("hex");
const stamp = path.join("node_modules", ".docspace-lock");
if (!fs.existsSync(stamp) || fs.readFileSync(stamp, "utf8") !== lock) {
  console.log("Installation des dépendances de DocSpace (Internet requis la première fois)…");
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--omit=dev"], {stdio:"inherit", shell:process.platform === "win32"});
  if (result.error || result.status !== 0) { console.error("Installation impossible. Vérifie ta connexion puis relance."); process.exit(1); }
  fs.writeFileSync(stamp, lock);
}
if (fs.existsSync(".env") && process.loadEnvFile) process.loadEnvFile(".env");
const port = Number(process.env.PORT || 8080);
console.log("DocSpace 3.5.0 — ouvre http://localhost:" + port);
console.log("Garde cette fenêtre ouverte. Ctrl+C arrête le serveur.");
const server = spawn(process.execPath, ["server.js"], {stdio:"inherit"});
server.on("error", error => { console.error(error.message); process.exitCode=1; });
server.on("exit", code => { process.exitCode=code || 0; });
process.on("SIGINT", () => server.kill("SIGINT"));
process.on("SIGTERM", () => server.kill("SIGTERM"));
