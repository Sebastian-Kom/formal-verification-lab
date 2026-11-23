#ifndef HEATING_HEATER_H
#define HEATING_HEATER_H

#include <stdbool.h>

bool heater_command(bool latched, bool heat_request);

#endif
