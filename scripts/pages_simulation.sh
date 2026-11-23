#!/bin/sh
# Compile the same main() and four C modules as "make demo".
set -eu
out=${1:?usage: pages_simulation.sh OUTPUT_DIR}
root=$(CDPATH='' cd "$(dirname "$0")/.." && pwd)
example="$root/examples/heater-shutdown"
revision=$(git -C "$root" rev-parse --verify HEAD)
mkdir -p "$out"
if command -v zig >/dev/null 2>&1; then
    set -- zig cc
else
    set -- python3 -m ziglang cc
fi
"$@" -target wasm32-wasi -Oz -std=c11 -Wall -Wextra -Wpedantic -Werror \
    -I"$example/include" "$example/src/sensors.c" "$example/src/latch.c" \
    "$example/src/heater.c" "$example/src/controller.c" "$example/demo/simulation.c" \
    -o "$out/simulation.$revision.wasm"
{
    printf "export const sourceRevision = '%s';\n" "$revision"
    cat "$root/scripts/pages_simulation_runtime.mjs"
} > "$out/simulation.mjs"
