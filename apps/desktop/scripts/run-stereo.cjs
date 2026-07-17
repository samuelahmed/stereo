const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const desktopRoot = path.resolve(__dirname, "..");
const electronExecutable = require("electron");

function prepareMacApp() {
  const sourceContents = path.resolve(path.dirname(electronExecutable), "..");
  const runtimeRoot = path.join(os.tmpdir(), "stereo-electron-runtime");
  const appBundle = path.join(runtimeRoot, "Stereo.app");
  const contents = path.join(appBundle, "Contents");
  const infoPath = path.join(contents, "Info.plist");

  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(contents, "MacOS"), { recursive: true });
  fs.mkdirSync(path.join(contents, "Resources"), { recursive: true });
  fs.copyFileSync(path.join(sourceContents, "Info.plist"), infoPath);
  fs.copyFileSync(path.join(sourceContents, "PkgInfo"), path.join(contents, "PkgInfo"));
  fs.copyFileSync(path.join(desktopRoot, "resources", "icon.icns"), path.join(contents, "Resources", "stereo.icns"));
  fs.symlinkSync(path.join(sourceContents, "Frameworks"), path.join(contents, "Frameworks"), "dir");
  fs.symlinkSync(electronExecutable, path.join(contents, "MacOS", "Stereo"), "file");
  fs.symlinkSync(
    path.join(sourceContents, "Resources", "default_app.asar"),
    path.join(contents, "Resources", "default_app.asar"),
    "file",
  );

  for (const [key, value] of [
    ["CFBundleDisplayName", "Stereo"],
    ["CFBundleName", "Stereo"],
    ["CFBundleExecutable", "Stereo"],
    ["CFBundleIdentifier", "app.stereo.preview"],
    ["CFBundleIconFile", "stereo.icns"],
  ]) {
    execFileSync("/usr/bin/plutil", ["-replace", key, "-string", value, infoPath]);
  }
  return appBundle;
}

if (process.platform === "darwin") {
  const appBundle = prepareMacApp();
  if (process.argv.includes("--prepare-only")) {
    console.log(appBundle);
  } else {
    // Launch Services owns the Dock identity. Starting the executable directly
    // would let the underlying Electron bundle leak back into the hover label.
    const child = spawn("/usr/bin/open", ["-n", "-W", appBundle, "--args", desktopRoot], {
      cwd: desktopRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", (error) => {
      console.error(error);
      process.exit(1);
    });
    child.on("close", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  }
} else {
  const child = spawn(electronExecutable, [desktopRoot], { cwd: desktopRoot, env: process.env, stdio: "inherit" });
  child.on("error", (error) => {
    console.error(error);
    process.exit(1);
  });
  child.on("close", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}
