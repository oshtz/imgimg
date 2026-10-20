// Runs `npm audit` and fails on high/critical advisories, except for an explicit
// allowlist of advisories that have no patched release and are not reachable at runtime.
// Usage: node scripts/audit-npm.mjs [package-dir] [--ignore GHSA-xxxx-xxxx-xxxx ...]
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const ignored = new Set();
let dir = ".";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--ignore") ignored.add(args[++i]);
  else dir = args[i];
}

const result = spawnSync("npm", ["audit", "--json"], {
  cwd: path.resolve(dir),
  encoding: "utf8",
  shell: process.platform === "win32",
});
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error(result.stdout, result.stderr);
  console.error("Failed to parse npm audit output.");
  process.exit(1);
}
if (report.error) {
  console.error("npm audit failed:", report.error);
  process.exit(1);
}

const blocking = new Map();
const seenIgnored = new Set();
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via === "string") continue; // inherited from another package's advisory
    if (via.severity !== "high" && via.severity !== "critical") continue;
    const ghsa = via.url?.split("/").pop();
    if (ignored.has(ghsa)) {
      seenIgnored.add(ghsa);
      continue;
    }
    blocking.set(`${name}: ${via.title} (${via.url})`, via.severity);
  }
}

for (const ghsa of seenIgnored) console.warn(`Ignoring allowlisted advisory ${ghsa}`);
for (const ghsa of ignored) {
  if (!seenIgnored.has(ghsa)) console.warn(`Allowlisted advisory ${ghsa} no longer applies; remove it from the ignore list.`);
}
if (blocking.size > 0) {
  for (const [line, severity] of blocking) console.error(`[${severity}] ${line}`);
  process.exit(1);
}
console.log(`No unallowlisted high/critical advisories in ${dir}.`);
