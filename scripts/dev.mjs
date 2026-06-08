import concurrently from "concurrently";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { result } = concurrently(
  [
    { command: "npm --prefix web run dev", name: "web", cwd: root },
  ],
  {
    killOthersOn: ["failure", "success"],
    prefixColors: ["magenta"],
  }
);

result.then(
  () => process.exit(0),
  () => process.exit(1)
);
