#include "sensors.h"

#define TRIP_TEMPERATURE_C 80

bool sensors_hazard(SensorReading first, SensorReading second)
{
    return !first.valid || !second.valid ||
           first.temperature_c >= TRIP_TEMPERATURE_C ||
           second.temperature_c >= TRIP_TEMPERATURE_C;
}
