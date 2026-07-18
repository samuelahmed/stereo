import { spawnSync } from "node:child_process";
import fs from "node:fs";

const version = process.argv[2]?.replace(/^v/, "");
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: pnpm release 0.1.0");
  process.exit(1);
}

const tag = `v${version}`;
const packageFiles = [
  "package.json",
  "packages/core/package.json",
  "apps/desktop/package.json",
  "apps/web/package.json",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

function output(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
  return result.stdout.trim();
}

if (output("git", ["status", "--porcelain"])) {
  console.error("Release aborted: the working tree is not clean.");
  process.exit(1);
}
if (output("git", ["branch", "--show-current"]) !== "main") {
  console.error("Release aborted: releases must be made from main.");
  process.exit(1);
}

run("git", ["fetch", "origin", "main", "--tags"]);
if (output("git", ["rev-parse", "HEAD"]) !== output("git", ["rev-parse", "origin/main"])) {
  console.error("Release aborted: local main must exactly match origin/main.");
  process.exit(1);
}

const tagCheck = spawnSync("git", ["rev-parse", "--quiet", "--verify", `refs/tags/${tag}`]);
if (tagCheck.status === 0) {
  console.error(`Release aborted: ${tag} already exists.`);
  process.exit(1);
}

const originals = new Map(packageFiles.map((file) => [file, fs.readFileSync(file, "utf8")]));
let committed = false;
let tagged = false;

try {
  for (const file of packageFiles) {
    const manifest = JSON.parse(originals.get(file));
    manifest.version = version;
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  run("pnpm", ["typecheck"]);
  run("pnpm", ["build"]);

  const changed = output("git", ["status", "--porcelain", "--", ...packageFiles]);
  if (changed) {
    run("git", ["add", "--", ...packageFiles]);
    run("git", ["commit", "-m", `release: ${tag}`]);
    committed = true;
  }

  run("git", ["tag", "-a", tag, "-m", `Stereo ${version}`]);
  tagged = true;
  run("git", ["push", "--atomic", "origin", "main", `refs/tags/${tag}`]);
  console.log(`\n${tag} is pushed. GitHub Actions is building the release now.`);
} catch (error) {
  if (!committed) {
    for (const [file, contents] of originals) fs.writeFileSync(file, contents);
  }
  console.error(`\nRelease failed: ${error instanceof Error ? error.message : String(error)}`);
  if (tagged) {
    console.error(`The local release is intact. Retry the atomic push with:`);
    console.error(`git push --atomic origin main refs/tags/${tag}`);
  } else if (committed) {
    console.error("The release commit is local and was not rewritten; inspect it before retrying.");
  }
  process.exit(1);
}
