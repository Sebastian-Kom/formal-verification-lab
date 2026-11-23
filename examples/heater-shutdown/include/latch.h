#ifndef HEATING_LATCH_H
#define HEATING_LATCH_H

#include <stdbool.h>

bool latch_next(bool was_latched, bool trip, bool reset);

#endif
