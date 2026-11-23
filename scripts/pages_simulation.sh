#!/bin/sh
# Compile each prepared snapshot's main() and four C modules as in "make demo".
set -eu
work=${1:?usage: pages_simulation.sh WORK_DIR OUTPUT_DIR}
out=${2:?usage: pages_simulation.sh WORK_DIR OUTPUT_DIR}
root=$(CDPATH='' cd "$(dirname "$0")/.." && pwd)
revision=$(jq -er '.commit' "$out/variants.json")
if command -v zig >/dev/null 2>&1; then
    set -- zig cc
else
    set -- python3 -m ziglang cc
fi
for variant in original swapped; do
    example="$work/$variant"
    target="$out/$variant"
    digest=$(jq -er --arg variant "$variant" '.variants[$variant].controllerSha256' "$out/variants.json")
    cmp "$example/src/controller.c" "$target/controller.c"
    "$@" -target wasm32-wasi -Oz -std=c11 -Wall -Wextra -Wpedantic -Werror \
        -I"$example/include" "$example/src/sensors.c" "$example/src/latch.c" \
        "$example/src/heater.c" "$example/src/controller.c" "$example/demo/simulation.c" \
        -o "$target/simulation.$revision.$digest.wasm"
    {
        printf "export const sourceRevision = '%s';\n" "$revision"
        printf "export const controllerSha256 = '%s';\n" "$digest"
        cat "$root/scripts/pages_simulation_runtime.mjs"
    } > "$target/simulation.mjs"
done
