"""Prepare two exact source snapshots for the two-line heater experiment."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = "examples/heater-shutdown"
CONTROLLER = Path("src/controller.c")


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def swap_calls(source):
    lines = source.splitlines(keepends=True)
    statements = [line.strip() for line in lines]
    signature = b"void controller_step(ControllerState *state, ControllerInput input)"
    command = b"state->heater_on = heater_command(state->latched, input.heat_request);"
    latch = b"state->latched = latch_next(state->latched, trip, input.reset);"
    if any(statements.count(s) != 1 for s in (signature, command, latch)):
        raise ValueError("Expected controller_step and one assignment for each editable call")
    first, second = sorted((statements.index(command), statements.index(latch)))
    start = statements.index(signature)
    end = statements.index(b"}", start)
    if second != first + 1 or not start < first < second < end:
        raise ValueError("Expected adjacent heater and latch assignments inside controller_step")
    lines[first], lines[second] = lines[second], lines[first]
    return b"".join(lines), [first + 1, second + 1]


def prepare(work, output, revision):
    commit = git("rev-parse", "--verify", f"{revision}^{{commit}}").decode().strip()
    tree = git("rev-parse", f"{commit}:{EXAMPLE}").decode().strip()
    # Start with fresh build directories so untracked inputs cannot enter either run.
    original = work / "original"
    original.mkdir(parents=True)
    subprocess.run(["tar", "-xf", "-", "-C", original],
                   input=git("archive", "--format=tar", tree), check=True)
    swapped = work / "swapped"
    shutil.copytree(original, swapped)
    replacement, editable_lines = swap_calls((original / CONTROLLER).read_bytes())
    (swapped / CONTROLLER).write_bytes(replacement)

    variants = {}
    for source in (original, swapped):
        directory = output / source.name
        directory.mkdir(parents=True, exist_ok=True)
        controller = (source / CONTROLLER).read_bytes()
        (directory / "controller.c").write_bytes(controller)
        variants[source.name] = {"controllerSha256": sha256(controller).hexdigest()}
    manifest = {"commit": commit, "editableLines": editable_lines, "variants": variants}
    (output / "variants.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path, help="Build directory for the fresh source snapshots")
    parser.add_argument("output", type=Path, help="Public directory for the two listings and manifest")
    parser.add_argument("--revision", default="HEAD", help="Git revision to build")
    args = parser.parse_args()
    prepare(args.work, args.output, args.revision)
