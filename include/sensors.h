#ifndef HEATING_SENSORS_H
#define HEATING_SENSORS_H

#include <stdbool.h>

typedef struct {
    int temperature_c;
    bool valid;
} SensorReading;

/*@ predicate safe_readings(integer temperature_a, integer valid_a,
                            integer temperature_b, integer valid_b) =
      valid_a != 0 && valid_b != 0 && temperature_a < 80 && temperature_b < 80;
*/

bool sensors_hazard(SensorReading first, SensorReading second);

#endif
