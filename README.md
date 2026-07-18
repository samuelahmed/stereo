<p align="center">
  <img src="branding/stereo/assets/lockup-primary.svg" alt="Stereo" width="260">
</p>

<p align="center"><strong>Claude &amp; Codex. One window.</strong></p>

<p align="center">
  <a href="https://getstereo.dev">Website</a> ·
  <a href="https://github.com/samuelahmed/stereo/releases">Releases</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="LICENSE">MIT License</a>
</p>

Stereo is a desktop shell for coding harnesses. Run Claude and Codex against
your repos, keep durable vendor-neutral history, and ask the other harness to
review a change in one click. Stereo uses the CLI subscriptions already signed in
on your computer.

> Stereo is an early developer preview. The interface, storage format, and release
> process will continue to evolve.

## Install

macOS and Linux:

```sh
curl -fsSL https://getstereo.dev/install | sh
```

Windows PowerShell:

```powershell
curl.exe -fsSL https://getstereo.dev/install.ps1 | Out-String | iex
```

The installers select the correct release artifact and verify its SHA-256
checksum. On macOS, Stereo installs in `/Applications` and asks for administrator
permission only when that directory is not writable. You can inspect the
[POSIX installer](apps/web/public/install) or
[PowerShell installer](apps/web/public/install.ps1) before running it.

macOS and Windows are the primary preview platforms. Linux builds are published
but have received less real-world testing. The macOS preview is ad-hoc signed, not
Apple-notarized; the command-line installation path does not silently change
Gatekeeper or quarantine settings.

### Requirements

- Claude, Codex, or both installed and signed in through their native tools.
- An active subscription for whichever harness you use.
- A Git repository to work in.

## What Stereo adds

- **One place for both harnesses.** Run multiple Claude and Codex conversations
  against the same repo and working tree.
- **Vendor-neutral history.** Stereo stores a local transcript independent of either
  harness's native session format.
- **Cross-lab forks.** Duplicate a thread to the other harness with a compiled context
  handoff, while keeping any trimming visible.
- **A built-in review feature.** Send the current context and uncommitted change to
  either harness for another set of eyes. Reviews begin without write access; a
  follow-up can be promoted to a normal working thread with your approval.
- **Your existing Git workflow.** Stereo does not create worktrees, commits, or a
  merge layer. Agents edit the branch you opened; you review and commit normally.
- **Local completion signals.** Optional native notifications and sounds tell you
  when background work finishes, fails, or needs approval.

## The commit loop

We built Stereo because we like programming in a small loop:

```text
clean working tree → build in Stereo → review in your IDE → commit
        ↑                                                   │
        └──────────────── clean working tree ───────────────┘
```

One scoped change, one coherent commit, then a clean place to begin again. Stereo
focuses on the build step: coordinating conversations, preserving their history,
and making it easy to bring in a second harness when useful. It is one workflow,
not a claim that every project should work this way.

## Local data and trust

Stereo has no account or hosted transcript service. Settings, projects, and
conversation history are stored in Electron's application-data directory on your
computer. Claude and Codex still communicate with their respective vendor
services under the subscriptions you already use.

Coding harnesses can read and modify files or execute commands according to the
access mode you choose. Treat an agent session with the same care as a terminal
session, review changes before committing, and report security issues privately as
described in [SECURITY.md](SECURITY.md).

## Development

Stereo is a pnpm workspace using Electron, React, and TypeScript. Development
requires Node.js 22 and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm dev        # Electron development mode with watchers
pnpm web        # getstereo.dev locally on http://localhost:4173
pnpm stereo     # build once and launch the desktop app
pnpm typecheck
pnpm build
pnpm check      # typecheck + production builds
```

On macOS and Linux, the installer behavior test can also be run directly:

```sh
sh scripts/test-install.sh
```

Opening `http://localhost:5175` in a plain browser displays the renderer's design
mock without launching agents or spending tokens. The real engine runs only inside
Electron.

## Repository map

```text
packages/core      engine, persistence, briefing compiler, Git helpers, adapters
apps/desktop       Electron main/preload processes and React renderer
apps/web           getstereo.dev and the stable installer endpoints
branding/stereo    generated identity assets, motion, tokens, and React character
```

The transcript is Stereo's canonical conversation record. Native Claude and
Codex session identifiers are used only to accelerate resume when available.

## Contributing

Bug reports, focused pull requests, and experiments are welcome. Start with
[CONTRIBUTING.md](CONTRIBUTING.md) and open an issue before investing in a large
change so the direction can be aligned early.

## License

Stereo's own source code and brand assets are available under the
[MIT License](LICENSE). Bundled and external dependencies remain under their own
terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Claude is a product of Anthropic, and Codex is a product of OpenAI. Stereo is
an independent project and is not affiliated with or endorsed by either company.
