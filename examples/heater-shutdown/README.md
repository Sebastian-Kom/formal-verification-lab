# Verifying a heater shutdown with Frama-C

Try the two-line exercise in your browser. It opens on `controller.c`, the file that brings the four C modules together. Open the `controller.h` tab beside it to read the contract. Each clause beginning with `ensures` states a promise the program must keep by the end of a control cycle. Both call orders are checked against those same four promises. [Open the live experiment](https://sebastian-kom.github.io/formal-verification-lab/examples/heater-shutdown/)

1. Choose **Demo** to see the temperature, the interlock and the heater output for each cycle. Look at the first row where a sensor reaches 80 °C. What does the heater do?
2. Choose **Verify** to see which of the four written requirements Frama-C could prove for the code on screen. You can start with this button, too.
3. Swap the two highlighted calls. Try either button again. The simulation uses the same temperatures and heat requests, so you can compare the same cycle in both runs.

A test build of a machine controller still has to shut the heater down when a sensor detects a problem. Can we show from the C code that it will switch the heater off when either sensor reports 80 °C? Can it turn the heater back on when heating is safe again? The example has four C modules. Three handle the sensor readings, shutdown interlock and heater output. The fourth calls them once per control cycle. [Controller source](src/controller.c)

## Four requirements for one control cycle

The two readings are **safe** when both are valid and both are **below 80 °C**. The shutdown interlock has two states, **latched** and **clear**, and remembers its state between cycles. Each requirement describes what must hold by the end of the **current** cycle.

| ID | Condition | Required result |
|---|---|---|
| A1 | Either sensor reports an invalid reading or a temperature of 80 °C or higher. | Latch the interlock and switch the heater output OFF, even if reset and a heat request are both active. |
| A2 | The interlock was latched at the start of the cycle and reset is inactive. | Keep the interlock latched and the output OFF, even if both readings are safe again. |
| A3 | Both readings are safe and reset is active. | Clear the interlock. Holding reset during an overtemperature event is sufficient to release it in the first cycle with two safe readings. |
| A4 | Both readings are safe, and either the interlock was already clear or reset is active. | The output follows the heat request. In every state, the output must be OFF whenever there is no heat request. |

A heater that stays off permanently could satisfy A1 through A3. A4 also requires it to heat when requested and permitted. Each requirement has a name and an `ensures` clause in the [contract for `controller_step()`](include/controller.h).

## Watch the controller run

Run the commands on this page from the directory containing this README (`examples/heater-shutdown/` in the lab).

```sh
make demo
```

Sensor A rises from 72 °C to 83 °C and then cools back to 72 °C. Sensor B reads one degree lower throughout. The heat request starts in cycle 3. Reset is held throughout the cooling phase. Each of the 23 rows shows the inputs and the resulting interlock state and heater output. In which cycles does the output change? [Simulation source](demo/simulation.c)

## Verify a test build

```sh
make test-build
```

The build reports one result for each of A1 through A4.

| Result | Meaning |
|---|---|
| `PROVED` | WP proved the requirement for every call allowed by the contract. |
| `UNPROVED` | At least one proof goal remains open. A solver timeout can also give this result. |
| `MISSING` | The proof report contains no goal for the expected requirement. |

The compiler creates `build/test-build` only after WP proves all four rules and the supporting technical checks pass. A tool error also stops the build. Run `make verify` to check the same code without compiling the executable.

**How does WP check every call?** WP stands for *Weakest Precondition*. It starts with a required outcome, such as “the heater output is OFF,” and works backwards through the C statements to determine what must hold on entry. It then tries to prove that the contract's entry conditions are sufficient. The proof covers every representable temperature for both sensors, their validity flags, the previous interlock state, and all combinations of heat request and reset. WP inlines the called functions so changes in any of the four modules feed into the proof. [Frama-C/WP](https://www.frama-c.com/fc-plugins/wp.html)

**What does Eva check?** Eva (*Evolved Value Analysis*) starts at `main()` and works forwards, tracking the values that variables can take. Here, the simulation supplies the inputs. When the proof report contains an open goal, the build runs Eva on that simulation. If Eva reports a postcondition as `invalid`, the program reaches a state that violates the named requirement. The simulation can also complete without warnings while a general proof remains open. Run `make diagnose` to run Eva separately. It prints a message only if it has something to report. [Frama-C/Eva](https://www.frama-c.com/fc-plugins/eva.html)

## What this means for regression testing

A regression occurs when a change breaks a requirement the code used to satisfy. The simulation uses two valid sensors. A proof of A1 also covers a failed second sensor while the heat request and reset are both active. Rechecking all four requirements after each change can help identify test cases that duplicate a property already proved for that build.

The contract covers the software command at the end of the control cycle. Checking the sensor wiring and measuring how long the physical relay takes to open require tests on the machine. [IFA Report 2/2017e, section 7.3 on validating the safety function](https://www.dguv.de/medien/ifa/en/pub/rep/pdf/reports-2019/report0217e/rep0217e.pdf) · [2025 edition, section 10.3 (in German)](https://publikationen.dguv.de/widgets/pdf/download/article/5091)

<details>
<summary>Tools and scope of the proof</summary>

The simulation requires Make and a C11 compiler. Verification uses Frama-C with WP and Eva, the Z3 solver, and `jq` to read the proof report. This example was tested with Frama-C 33.0 and Z3 4.13.3. The build passes `CPPFLAGS` and `CFLAGS` to the analysis preprocessor as well as to the compiler. The `MACHDEP` machine model defaults to `macos_arm` and must match the target platform.

WP also checks properties such as valid memory accesses and normal return from the control cycle. The build reads the fresh report and groups proof goals by requirement. Individual goals appear in `build/wp.json`, and the full tool output is in `build/wp.log`.

For the browser exercise, GitHub Actions takes the original controller from the published revision and prepares a second copy with just the two calls exchanged. It compiles each version to WebAssembly and checks its output against the native C demo. **Demo** runs the selected version in your browser. **Verify** opens the corresponding WP and Eva reports, generated during publication with the `x86_64` C machine model. Each report records the revision and a SHA-256 fingerprint of the displayed `controller.c`. To run the analysis yourself, use `make verify` with the same call order.

The caller supplies an initialized `ControllerState` object. WP 33 reports that it skips checks for pointer alignment and calls through function pointers. This example uses a properly aligned state object and direct function calls.

</details>
