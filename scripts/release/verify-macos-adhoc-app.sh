#!/usr/bin/env bash

set -euo pipefail

export LC_ALL=C

if [ "$#" -ne 1 ]; then
  echo "Usage: verify-macos-adhoc-app.sh <FyAgent.app>" >&2
  exit 2
fi

app_path="$1"
if [ ! -d "$app_path" ]; then
  echo "macOS ad-hoc verification target is not an app directory: $app_path" >&2
  exit 1
fi

for architecture in arm64 x86_64; do
  if ! signature_info="$(codesign --display --verbose=4 --architecture "$architecture" "$app_path" 2>&1)"; then
    echo "Unable to read the $architecture code signature from $app_path" >&2
    printf '%s\n' "$signature_info" >&2
    exit 1
  fi

  # This output is public build evidence. An ad-hoc seal has no publisher
  # identity, certificate chain, or secure timestamp and must cover resources.
  printf '%s\n' "$signature_info"
  grep -Fxq 'Identifier=com.fyagent.desktop' <<<"$signature_info" || {
    echo "$architecture signature identifier drifted" >&2
    exit 1
  }
  grep -Fxq 'Signature=adhoc' <<<"$signature_info" || {
    echo "$architecture signature is not ad-hoc" >&2
    exit 1
  }
  grep -Eq '^CodeDirectory .*flags=.*adhoc' <<<"$signature_info" || {
    echo "$architecture CodeDirectory is not marked ad-hoc" >&2
    exit 1
  }
  grep -Fxq 'TeamIdentifier=not set' <<<"$signature_info" || {
    echo "$architecture signature unexpectedly has a team identity" >&2
    exit 1
  }
  grep -Eq '^Sealed Resources version=' <<<"$signature_info" || {
    echo "$architecture signature does not seal the application resources" >&2
    exit 1
  }
  if grep -Eqi 'linker-signed|^Authority=|Developer ID' <<<"$signature_info"; then
    echo "$architecture signature contains distribution or unnormalized linker identity evidence" >&2
    exit 1
  fi
  timestamp_lines="$(grep -E '^Timestamp=' <<<"$signature_info" || true)"
  if [ -n "$timestamp_lines" ] && [ "$timestamp_lines" != 'Timestamp=none' ]; then
    echo "$architecture ad-hoc signature unexpectedly has a secure timestamp" >&2
    exit 1
  fi
done

codesign --verify --deep --strict --verbose=4 "$app_path"
if xcrun stapler validate "$app_path" >/dev/null 2>&1; then
  echo "Ad-hoc application unexpectedly contains a notarization ticket: $app_path" >&2
  exit 1
fi
