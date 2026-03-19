#!/bin/sh
# Best-effort local modules bootstrap for Linux installs
set +e

BIN=""

if command -v codin >/dev/null 2>&1; then
  BIN="$(command -v codin)"
elif [ -x "/opt/CodIn/codin" ]; then
  BIN="/opt/CodIn/codin"
elif [ -x "/opt/CodIn/CodIn" ]; then
  BIN="/opt/CodIn/CodIn"
elif [ -x "/usr/bin/codin" ]; then
  BIN="/usr/bin/codin"
fi

if [ -n "$BIN" ]; then
  "$BIN" --bootstrap-only || true
fi

exit 0
