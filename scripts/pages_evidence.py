"""Run WP and Eva on one prepared controller from the two-line editing exercise."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

from pages_variants import CONTROLLER, EXAMPLE, ROOT, git, swap_calls

CONTRACTS = {
    "immediate_shutdown": "A1",
    "hold_without_reset": "A2",
    "release_on_reset": "A3",
    "follow_heat_request": "A4",
}


def read_rules(goals, transcript):
    # The example's own reporter supplies the requirement titles and outcomes.
    rows = re.findall(r"^(A\d+)  (.+) – (PROVED|UNPROVED|MISSING)$", transcript, re.M)
    labels = {identifier: (title, status) for identifier, title, status in rows}
    if len(rows) != len(CONTRACTS) or set(labels) != set(CONTRACTS.values()):
        raise ValueError("Incomplete requirement summary from make verify")

    evidence = {name: [] for name in CONTRACTS}
    for goal in goals:
        name = goal["property"].removeprefix("controller_step_ensures_")
        if goal["function"] == "controller_step" and name in evidence:
            evidence[name].append(goal)
        elif not (goal["passed"] is True and goal["verdict"] == "valid"):
            raise ValueError(f"Unproved supporting goal: {goal['property']}")

    rules = []
    for name, identifier in CONTRACTS.items():
        group = evidence[name]
        if not group or any(g["verdict"] not in ("valid", "unknown", "timeout", "invalid")
                            or g["passed"] is not (g["verdict"] == "valid") for g in group):
            raise ValueError(f"Missing result or tool failure for {name}")
        proved = all(g["passed"] is True and g["verdict"] == "valid" for g in group)
        title, status = labels[identifier]
        if status != ("PROVED" if proved else "UNPROVED"):
            raise ValueError(f"Inconsistent result for {name}")
        rules.append(dict(id=identifier, name=name, title=title, status=status))
    return rules


def make(target, cwd, env):
    result = subprocess.run(["make", "--no-print-directory", target], cwd=cwd, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    print(result.stdout, end="", flush=True)
    return result


def export(output, revision, variant, controller):
    commit = git("rev-parse", "--verify", f"{revision}^{{commit}}").decode().strip()
    tree = git("rev-parse", f"{commit}:{EXAMPLE}").decode().strip()
    env = {**os.environ, "LC_ALL": "C"}
    wrapper = ROOT / EXAMPLE / ".tools/bin/frama-c"
    if wrapper.is_file():
        env.setdefault("FRAMAC", str(wrapper))

    # Each analysis starts with a fresh copy of exactly the same repository tree.
    # Only the displayed controller may differ, and only by the supported edit.
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp).resolve()
        subprocess.run(["tar", "-xf", "-", "-C", str(source)],
                       input=git("archive", "--format=tar", tree), check=True)
        analysis_controller = source / CONTROLLER
        base = analysis_controller.read_bytes()
        expected = base if variant == "original" else swap_calls(base)[0]
        candidate = controller.read_bytes()
        if candidate != expected:
            raise ValueError(f"The supplied controller does not match the {variant} source")
        analysis_controller.write_bytes(candidate)
        default_model = re.search(r"^MACHDEP\s*\?=\s*(\S+)", (source / "Makefile").read_text(), re.M)
        machine_model = env.get("MACHDEP") or default_model.group(1)
        env["MACHDEP"] = machine_model
        proof = make("verify", source, env)
        report = source / "build/wp.json"
        goals = json.loads(report.read_text())
        rules = read_rules(goals, proof.stdout)
        unproved = {rule["id"] for rule in rules if rule["status"] == "UNPROVED"}
        if bool(unproved) != (proof.returncode != 0):
            raise ValueError("The verification exit status disagrees with the report")

        # verify deliberately returns failure for an open contract. Run diagnose
        # separately so a tool error cannot masquerade as the expected Eva alarm.
        diagnostic = make("diagnose", source, env)
        diagnostic.check_returncode()
        names = re.findall(r"function controller_step: postcondition '(\w+)' got status invalid\.",
                           diagnostic.stdout)
        if diagnostic.stdout.count("[eva:alarm]") != len(names):
            raise ValueError("Eva reported an unexpected alarm; inspect the diagnostic")
        invalid = sorted({CONTRACTS[name] for name in names})
        if not set(invalid).issubset(unproved):
            raise ValueError("Eva invalidated a postcondition that WP marked proved")
        if variant == "original" and (unproved != {"A1", "A4"} or "A1" not in invalid):
            raise ValueError("The original exercise no longer demonstrates the expected contract failure")
        if variant == "swapped" and unproved:
            raise ValueError("The two-line edit did not prove every requirement")

        # Keep source locations useful in downloads without publishing build paths.
        for goal in goals:
            filename = source / goal["file"]
            goal["file"] = str(filename.resolve().relative_to(source))
        version = subprocess.check_output([env.get("FRAMAC", "frama-c"), "-version"],
                                          cwd=source, env=env, text=True).strip()
        evidence = dict(commit=commit, base_source_tree=tree, variant=variant,
                        controllerSha256=hashlib.sha256(candidate).hexdigest(),
                        checkedAt=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                        frama_c=version,
                        machineModel=machine_model, rules=rules,
                        eva=dict(ran=True, invalid=invalid))
        if variant == "original":
            evidence["source_tree"] = tree
        artifacts = {
            "wp.json": json.dumps(goals, indent=2) + "\n",
            "wp.log": (source / "build/wp.log").read_text(),
            "eva.log": (f"Frama-C {version}\nmake diagnose (exit 0)\n"
                        + diagnostic.stdout),
            "evidence.json": json.dumps(evidence, indent=2) + "\n",
        }
        output.mkdir(parents=True, exist_ok=True)
        for name, contents in artifacts.items():
            (output / name).write_text(contents.replace(str(source) + "/", ""))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Directory for evidence.json and tool reports")
    parser.add_argument("--variant", choices=("original", "swapped"), required=True)
    parser.add_argument("--controller", type=Path, required=True, help="Exact controller.c shown in the editor")
    parser.add_argument("--revision", default="HEAD", help="Git revision to analyze (default: HEAD)")
    args = parser.parse_args()
    export(args.output, args.revision, args.variant, args.controller)
