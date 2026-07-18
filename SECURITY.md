# Security policy

Stereo runs coding agents with access to local repositories, so command execution,
file access, permission boundaries, transcript privacy, and release integrity are
all security-sensitive.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
[private vulnerability reporting](https://github.com/samuelahmed/stereo/security/advisories/new)
to share a description, reproduction steps, affected platforms, and any suggested
mitigation.

Useful reports include, but are not limited to:

- a harness gaining more file or command access than the selected permission mode;
- arbitrary local-file reads through renderer or IPC boundaries;
- unsafe handling of links, attachments, transcripts, or project paths;
- credentials or private context being stored, logged, or handed off unexpectedly;
- installer, checksum, packaging, or release-pipeline integrity failures.

Reports will be acknowledged as soon as practical. Please allow time for a fix and
coordinated disclosure before publishing details.

## Supported versions

Stereo is currently a developer preview. Security fixes are made against the
latest release and `main`; older preview builds are not maintained separately.
