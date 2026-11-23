#include "controller.h"
#include "heater.h"
#include "latch.h"

void controller_init(ControllerState *state)
{
    state->latched = false;
    state->heater_on = false;
}

void controller_step(ControllerState *state, ControllerInput input)
{
    bool trip = sensors_hazard(input.first, input.second);

    state->heater_on = heater_command(state->latched, input.heat_request);
    state->latched = latch_next(state->latched, trip, input.reset);
}
