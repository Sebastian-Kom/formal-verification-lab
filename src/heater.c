#include "heater.h"

bool heater_command(bool latched, bool heat_request)
{
    return !latched && heat_request;
}
