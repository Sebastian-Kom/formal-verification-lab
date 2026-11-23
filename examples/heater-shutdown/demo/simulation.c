#include "controller.h"

#include <stdio.h>

#define PEAK_CYCLE 12
#define LAST_CYCLE (2 * PEAK_CYCLE - 1)

int main(void)
{
    int temperature = 72;
    ControllerState state;
    controller_init(&state);

    puts("Cycle  A (°C)  B (°C)  Heat request  Reset  Interlock  Output");
    for (int cycle = 1; cycle <= LAST_CYCLE; ++cycle) {
        ControllerInput input = {
            .first = {temperature, true},
            .second = {temperature - 1, true},
            .heat_request = cycle >= 3,
            .reset = cycle > PEAK_CYCLE
        };
        controller_step(&state, input);
        printf("%5d  %6d  %6d  %12s  %5s  %9s  %6s\n", cycle,
               input.first.temperature_c, input.second.temperature_c,
               input.heat_request ? "yes" : "no", input.reset ? "yes" : "no",
               state.latched ? "latched" : "clear", state.heater_on ? "ON" : "OFF");
        temperature += cycle < PEAK_CYCLE ? 1 : -1;
    }
    return 0;
}
