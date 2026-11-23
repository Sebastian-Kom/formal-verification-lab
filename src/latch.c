#include "latch.h"

bool latch_next(bool was_latched, bool trip, bool reset)
{
    return trip || (was_latched && !reset);
}
