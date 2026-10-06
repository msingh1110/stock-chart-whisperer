import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const dir = await mkdtemp(path.join(tmpdir(), "probability-tests-"));
try {
  const outfile = path.join(dir, "tests.mjs");
  await build({
    entryPoints: ["src/lib/probabilities.test.ts"], outfile,
    platform: "node", target: "node24", format: "esm", bundle: true,
  });
  const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
