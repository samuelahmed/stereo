# Contributing to Stereo

Stereo is an early developer preview. Focused bug fixes, documentation
improvements, small features, and experiments are welcome. For a large behavioral
or architectural change, open an issue first so we can align before either side
invests heavily.

## Set up the repository

You need Node.js 22 and pnpm 11. Claude or Codex is required only when testing
a real agent conversation; the renderer also has a browser-only design mode.

```sh
git clone https://github.com/samuelahmed/stereo.git
cd stereo
pnpm install --frozen-lockfile
pnpm dev
```

Useful commands:

```sh
pnpm dev        # desktop app with watchers
pnpm web        # landing site
pnpm stereo     # one production build, then launch
pnpm typecheck
pnpm build
pnpm check      # typecheck + production builds
```

On macOS and Linux, validate the public installer with:

```sh
sh scripts/test-install.sh
```

## Project principles

- Keep the transcript and briefing formats vendor-neutral.
- Preserve the user's existing Git workflow; Stereo does not own commits or
  worktrees.
- Make permission changes explicit. A review may gain write access only after the
  user approves that transition.
- Keep user data local unless a feature clearly explains and requires otherwise.
- Avoid silently discarding conversation history or briefing content.
- Keep changes scoped enough to review as one coherent commit.

## Pull requests

Before opening a pull request:

1. Run `pnpm check`.
2. Run `sh scripts/test-install.sh` when changing the POSIX installer or release
   artifact layout. Windows installer syntax is also checked in CI.
3. Regenerate branding assets with `node branding/stereo/generate.mjs` when changing
   canonical geometry or tokens; do not hand-edit generated SVGs.
4. Explain the user-visible behavior and any storage, permissions, or release
   implications in the pull request.

Please do not include unrelated formatting or generated-file churn.

## Releases

Releases are maintainer-only. From a clean `main` branch that exactly matches
GitHub:

```sh
pnpm release 0.1.1
```

The helper aligns workspace versions, runs checks, creates an annotated tag, and
pushes atomically. GitHub publishes a release only after every native package job
succeeds. Developer previews must remain normal GitHub releases rather than being
marked as prereleases because the installers use GitHub's `latest/download` URLs.
