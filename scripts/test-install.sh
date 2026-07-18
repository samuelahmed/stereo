#!/bin/sh
set -eu

repository_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/stereo-installer-test.XXXXXX")"
release_directory="$test_root/release"
fake_home="$test_root/home"
fake_bin="$test_root/bin"
mkdir -p "$release_directory" "$fake_home" "$fake_bin"

cleanup() {
  rm -rf "$test_root"
}
trap cleanup EXIT

case "$(uname -s)" in
  Darwin)
    case "$(uname -m)" in
      arm64) architecture="arm64" ;;
      *) architecture="x64" ;;
    esac
    asset="stereo-darwin-$architecture.zip"
    fixture="$test_root/fixture"
    mkdir -p "$fixture/Stereo.app/Contents"
    printf 'current release\n' > "$fixture/Stereo.app/Contents/installer-test.txt"
    (cd "$fixture" && zip -qry "$release_directory/$asset" Stereo.app)
    printf '#!/bin/sh\nexit 0\n' > "$fake_bin/open"
    chmod +x "$fake_bin/open"
    installed_marker="$fake_home/Applications/Stereo.app/Contents/installer-test.txt"
    ;;
  Linux)
    case "$(uname -m)" in
      aarch64|arm64) architecture="arm64" ;;
      *) architecture="x64" ;;
    esac
    asset="stereo-linux-$architecture.tar.gz"
    fixture="$test_root/fixture/stereo-release"
    mkdir -p "$fixture"
    printf '#!/bin/sh\nprintf "current release\\n"\n' > "$fixture/stereo"
    chmod +x "$fixture/stereo"
    tar -czf "$release_directory/$asset" -C "$test_root/fixture" stereo-release
    installed_marker="$fake_home/.local/share/stereo/stereo"
    ;;
  *)
    printf 'Installer behavior test skipped on this operating system.\n'
    exit 0
    ;;
esac

if command -v shasum >/dev/null 2>&1; then
  checksum="$(shasum -a 256 "$release_directory/$asset" | awk '{ print $1 }')"
else
  checksum="$(sha256sum "$release_directory/$asset" | awk '{ print $1 }')"
fi
printf '%s  %s\n' "$checksum" "$asset" > "$release_directory/SHA256SUMS"

printf '%s\n' \
  '#!/bin/sh' \
  'set -eu' \
  'destination=""' \
  'url=""' \
  'while [ "$#" -gt 0 ]; do' \
  '  case "$1" in' \
  '    -o) destination="$2"; shift 2 ;;' \
  '    https://*) url="$1"; shift ;;' \
  '    *) shift ;;' \
  '  esac' \
  'done' \
  'cp "$STEREO_TEST_RELEASE/${url##*/}" "$destination"' \
  > "$fake_bin/curl"
chmod +x "$fake_bin/curl"

STEREO_TEST_RELEASE="$release_directory" \
  HOME="$fake_home" \
  PATH="$fake_bin:$PATH" \
  TMPDIR="$test_root" \
  sh "$repository_root/apps/web/public/install"

test -f "$installed_marker"
if [ "$(uname -s)" = "Linux" ]; then test -L "$fake_home/.local/bin/stereo"; fi
printf 'Installer behavior test passed for %s %s.\n' "$(uname -s)" "$architecture"
