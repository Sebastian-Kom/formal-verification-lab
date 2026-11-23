# Formal Verification Lab

This lab explores what different formal verification tools can establish about software. Each example starts with a concrete question, identifies the code or model under analysis, and explains how to interpret the result under the stated assumptions.

## Examples

| Example | Verification question | Tools and methods |
|---|---|---|
| [Heater shutdown](examples/heater-shutdown/) | If either sensor reports an invalid reading or a temperature of 80 °C or higher, do four C modules working together switch the heater output off in the same control cycle? | Frama-C WP checks contracts across the C modules. Eva tracks values through a simulated heating and cooling cycle. |

## Try the heater example

Predict what the heater should do at 80 °C, run the controller in your browser, then reveal the Frama-C results for the same C source. [Open the live heater experiment](https://sebastian-kom.github.io/formal-verification-lab/examples/heater-shutdown/)

From the repository root, run the simulation to see the sensor readings, interlock state and heater output. Then check the four controller requirements.

```sh
make -C examples/heater-shutdown demo
make -C examples/heater-shutdown verify
```

The simulation needs Make and a C11 compiler. Verification also uses Frama-C with WP and Eva, Z3 and `jq`. The example guide describes the four requirements, the target machine model and the meaning of each proof status.
