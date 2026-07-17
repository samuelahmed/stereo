# Stereo brand package

This directory is the production-oriented identity source for Stereo. It replaces the exploratory contact sheets as the place to consume and maintain the character.

The package deliberately matches the product's narrow scope: a desktop coding client with idle, working, and winking states. Working combines movement and cassette-mouth speech instead of splitting the character into extra operational identities.

## Canonical identity

- **Primary mark:** approved animated boombox character at rest, with cassette slot
- **Primary color — Stereo Blue:** `#3B78D8`
- **Accessible UI blue:** `#2F68C2`
- **Tape Cream:** `#FFFAF1`
- **Stereo Ink:** `#24212A`
- **Wordmark:** lowercase `stereo`, 650 weight, system/Inter-style sans serif

The character uses one 80×80 integer-grid geometry. Static assets remain single-color SVGs with transparent cutouts.

## Directory

```text
branding/stereo/
  generate.mjs             canonical geometry and asset generator
  manifest.json            generated asset inventory
  tokens.css               CSS color variables
  tokens.json              portable color tokens
  preview.html             complete local preview
  assets/
    mark-primary.svg       default logo
    mark-silent.svg        eyes-only small-size state
    mark-cassette.svg      explicit cassette state
    mark-ink.svg           monochrome dark mark
    mark-white.svg         reversed mark
    app-icon.svg           1024×1024 scalable app-icon source
    favicon.svg            cream-backed browser icon
    tray-template.svg      monochrome menu-bar source
    lockup-primary.svg     blue character + lowercase wordmark
    lockup-ink.svg         monochrome lockup
  motion/
    idle.svg               gentle bounce, eye movement, occasional wink
    working.svg            quicker bounce, steps, looking, wink, and speech
    wink.svg               standalone expression
  component/
    StereoCharacter.tsx    reusable React implementation
    StereoCharacter.css    motion states and reduced-motion support
```

## Regenerate

From the repository root:

```sh
node branding/stereo/generate.mjs
```

Generated assets should not be edited by hand. Change the canonical geometry or tokens in `generate.mjs`, then regenerate.

## Preview

On macOS:

```sh
open branding/stereo/preview.html
```

No server or build step is required.

## Usage rules

- Use `mark-primary.svg` by default.
- Use `mark-silent.svg` only when the cassette slot becomes visually noisy below roughly 24px; its speaker-eyes must remain.
- Never show the chassis without a face. Every character and every wordmark lockup keeps at least the speaker-eyes visible.
- Use the white mark only on Stereo Blue or Stereo Ink.
- Keep clear space around the mark equal to one speaker radius.
- Do not round the chassis, add outlines, gradients, shadows, arms, or extra legs.
- Keep vendor colors out of the core mark. Claude/Codex colors remain operational UI indicators only.
- Respect `prefers-reduced-motion`; the supplied React/CSS implementation does.

`#3B78D8` is a brand and large-element color, not normal small text. On Tape Cream its contrast is approximately 4.15:1. Use Stereo Ink for body text and `#2F68C2` when an accessible blue is required for normal text or controls.
