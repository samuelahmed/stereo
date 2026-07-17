import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "assets");
const MOTION = join(ROOT, "motion");

const color = {
  blue: "#3B78D8",
  blueDark: "#2F68C2",
  cream: "#FFFAF1",
  ink: "#24212A",
  white: "#FFFFFF",
};

mkdirSync(OUT, { recursive: true });
mkdirSync(MOTION, { recursive: true });

const silhouette = [
  '<path d="M28 16h24v2h4v10h-4v-8H28v8h-4V18h4z"/>',
  '<rect x="10" y="26" width="60" height="26"/>',
  '<rect x="22" y="52" width="8" height="12"/>',
  '<rect x="50" y="52" width="8" height="12"/>',
].join("");

const speakers = '<path d="M18 32h12v2h2v10h-2v2H18v-2h-2V34h2zM50 32h12v2h2v10h-2v2H50v-2h-2V34h2z"/>';
const pupils = '<rect x="22" y="37" width="6" height="6"/><rect x="54" y="37" width="6" height="6"/>';

function document(content, viewBox = "0 0 80 80", attrs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" shape-rendering="crispEdges" ${attrs}>${content}</svg>\n`;
}

function mask({ mouth = "slot", id = "stereo-mark" } = {}) {
  const mouthCutout = mouth === "slot"
    ? '<rect fill="#000" x="28" y="48" width="24" height="2"/>'
    : mouth === "cassette"
      ? '<path fill="#000" d="M26 47h28v3H26z"/><path fill="#fff" d="M31 48h5v1h-5zM44 48h5v1h-5z"/>'
      : "";
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="80" height="80"><g fill="#fff">${silhouette}</g><g fill="#000">${speakers}</g><g fill="#fff">${pupils}</g>${mouthCutout}</mask>`;
}

function transparentMark(fill, options = {}) {
  return document(`<defs>${mask(options)}</defs><rect width="80" height="80" fill="${fill}" mask="url(#stereo-mark)"/>`);
}

function placedTransparentMark(fill, id, transform = "") {
  return `<g ${transform ? `transform="${transform}"` : ""}><defs>${mask({ id })}</defs><rect width="80" height="80" fill="${fill}" mask="url(#${id})"/></g>`;
}

function placedMark(fill, background, options = {}, transform = "") {
  const mouth = options.mouth === "silent"
    ? ""
    : options.mouth === "cassette"
      ? `<path fill="${background}" d="M26 47h28v3H26z"/><path fill="${fill}" d="M31 48h5v1h-5zM44 48h5v1h-5z"/>`
      : `<rect fill="${background}" x="28" y="48" width="24" height="2"/>`;
  return `<g ${transform ? `transform="${transform}"` : ""}><g fill="${fill}">${silhouette}</g><g fill="${background}">${speakers}</g><g fill="${fill}">${pupils}</g>${mouth}</g>`;
}

const assets = {
  "mark-primary.svg": transparentMark(color.blue),
  "mark-silent.svg": transparentMark(color.blue, { mouth: "silent" }),
  "mark-cassette.svg": transparentMark(color.blue, { mouth: "cassette" }),
  "mark-ink.svg": transparentMark(color.ink),
  "mark-white.svg": transparentMark(color.white),
  "tray-template.svg": transparentMark("#000000", { mouth: "silent" }),
  "favicon.svg": document(`<rect width="80" height="80" fill="${color.cream}"/>${placedMark(color.blue, color.cream)}`),
  "app-icon.svg": document(`<rect width="1024" height="1024" rx="224" fill="${color.cream}"/>${placedMark(color.blue, color.cream, {}, "translate(112 112) scale(10)")}`, "0 0 1024 1024"),
  "lockup-primary.svg": document(`${placedTransparentMark(color.blue, "lockup-primary-mark", "translate(4 4) scale(1.15)")}<text x="108" y="67" fill="${color.ink}" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="50" font-weight="650" letter-spacing="-1.5">stereo</text>`, "0 0 300 100"),
  "lockup-ink.svg": document(`${placedTransparentMark(color.ink, "lockup-ink-mark", "translate(4 4) scale(1.15)")}<text x="108" y="67" fill="${color.ink}" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="50" font-weight="650" letter-spacing="-1.5">stereo</text>`, "0 0 300 100"),
};

for (const [name, contents] of Object.entries(assets)) {
  writeFileSync(join(OUT, name), contents);
}

const motionBase = (css) => {
  return document(`<rect width="320" height="320" fill="${color.cream}"/><style>${css}</style><g class="character" fill="${color.blue}"><path d="M112 64h96v8h16v40h-16V80h-96v32H96V72h16z"/><rect x="40" y="104" width="240" height="104"/><rect class="left-leg" x="88" y="208" width="32" height="48"/><rect class="right-leg" x="200" y="208" width="32" height="48"/><g class="left-eye"><path fill="${color.cream}" d="M72 128h48v8h8v40h-8v8H72v-8h-8v-40h8z"/><rect class="left-pupil" x="88" y="148" width="24" height="24"/></g><g class="right-eye"><path fill="${color.cream}" d="M200 128h48v8h8v40h-8v8h-48v-8h-8v-40h8z"/><rect class="right-pupil" x="216" y="148" width="24" height="24"/></g><rect class="slot" x="112" y="192" width="96" height="8" fill="${color.cream}"/></g>`, "0 0 320 320");
};

const sharedMotionCss = `.character,.left-eye,.left-pupil,.right-pupil,.left-leg,.right-leg,.slot{transform-box:fill-box}.character{transform-origin:center}.left-eye{transform-origin:center}.slot{transform-origin:center}`;
const idleCss = `${sharedMotionCss}.character{animation:idle-bounce 1.8s steps(2) infinite}.left-eye{animation:idle-wink 5.4s steps(1) infinite}.left-pupil,.right-pupil{animation:idle-look 5.4s steps(1) infinite}@keyframes idle-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@keyframes idle-wink{0%,87%,94%,100%{transform:scaleY(1)}89%,92%{transform:scaleY(.16)}}@keyframes idle-look{0%,48%,100%{transform:translateX(0)}52%,66%{transform:translateX(8px)}70%,84%{transform:translateX(-8px)}}`;
const workingCss = `${sharedMotionCss}.character{animation:work-bounce 720ms steps(2) infinite}.left-leg{animation:left-step 720ms steps(2) infinite}.right-leg{animation:right-step 720ms steps(2) infinite}.left-pupil,.right-pupil{animation:work-look 2.88s steps(1) infinite}.left-eye{animation:work-wink 4.32s steps(1) infinite}.slot{animation:speak 720ms steps(2) infinite}@keyframes work-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@keyframes left-step{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@keyframes right-step{0%,100%{transform:translateY(-8px)}50%{transform:translateY(0)}}@keyframes work-look{0%,38%,100%{transform:translateX(0)}42%,64%{transform:translateX(8px)}68%,90%{transform:translateX(-8px)}}@keyframes work-wink{0%,90%,96%,100%{transform:scaleY(1)}92%,94%{transform:scaleY(.16)}}@keyframes speak{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.55)}}`;
const winkCss = `${sharedMotionCss}.left-eye{animation:wink 1.8s steps(1) infinite}@keyframes wink{0%,38%,72%,100%{transform:scaleY(1)}44%,64%{transform:scaleY(.16)}}`;

for (const stale of ["speaking.svg", "handoff.svg", "review.svg"]) rmSync(join(MOTION, stale), { force: true });
rmSync(join(OUT, "mark-review.svg"), { force: true });
writeFileSync(join(MOTION, "idle.svg"), motionBase(idleCss));
writeFileSync(join(MOTION, "working.svg"), motionBase(workingCss));
writeFileSync(join(MOTION, "wink.svg"), motionBase(winkCss));

writeFileSync(join(ROOT, "tokens.css"), `:root {\n  --stereo-blue: ${color.blue};\n  --stereo-blue-dark: ${color.blueDark};\n  --stereo-cream: ${color.cream};\n  --stereo-ink: ${color.ink};\n  --stereo-white: ${color.white};\n}\n`);
writeFileSync(join(ROOT, "tokens.json"), `${JSON.stringify(color, null, 2)}\n`);

const manifest = {
  generatedBy: "branding/stereo/generate.mjs",
  canonicalViewBox: "0 0 80 80",
  primaryColor: color.blue,
  staticAssets: Object.keys(assets),
  motionAssets: ["idle.svg", "working.svg", "wink.svg"],
};
writeFileSync(join(ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Generated ${Object.keys(assets).length + manifest.motionAssets.length} Stereo assets.`);
