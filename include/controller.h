#ifndef HEATING_CONTROLLER_H
#define HEATING_CONTROLLER_H

#include "sensors.h"

typedef struct {
    SensorReading first;
    SensorReading second;
    bool heat_request;
    bool reset;
} ControllerInput;

typedef struct {
    bool latched;
    bool heater_on;
} ControllerState;

void controller_init(ControllerState *state);

/*@ requires \valid(state);
    terminates \true;
    assigns state->latched, state->heater_on;
    exits \false;
    ensures immediate_shutdown:
        !safe_readings(input.first.temperature_c, input.first.valid,
                       input.second.temperature_c, input.second.valid)
        ==> (state->latched != 0 && state->heater_on == 0);
    ensures hold_without_reset:
        \old(state->latched) != 0 && input.reset == 0
        ==> (state->latched != 0 && state->heater_on == 0);
    ensures release_on_reset:
        input.reset != 0 &&
        safe_readings(input.first.temperature_c, input.first.valid,
                      input.second.temperature_c, input.second.valid)
        ==> state->latched == 0;
    ensures follow_heat_request:
        (input.heat_request == 0 ==> state->heater_on == 0) &&
        ((\old(state->latched) == 0 || input.reset != 0) &&
         safe_readings(input.first.temperature_c, input.first.valid,
                       input.second.temperature_c, input.second.valid)
         ==> state->heater_on == input.heat_request);
*/
void controller_step(ControllerState *state, ControllerInput input);

#endif
