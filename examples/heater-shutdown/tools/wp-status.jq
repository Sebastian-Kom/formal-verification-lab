def proved:
  .passed == true and .verdict == "valid";

# A single postcondition can generate several goals in the WP report.
def rule($title; $name):
  map(select(.function == "controller_step" and
             .property == ("controller_step_ensures_" + $name)))
  | {title: $title, status:
      (if length == 0 then "MISSING"
       elif all(.[]; proved) then "PROVED"
       else "UNPROVED" end)};

if length == 1 and (.[0] | type) == "array" then .[0]
else error("Expected a complete WP report.") end
| . as $goals
| [
    rule("A1  Shut down on a hazardous reading"; "immediate_shutdown"),
    rule("A2  Keep the interlock engaged without reset"; "hold_without_reset"),
    rule("A3  Release the interlock when both readings are safe and reset is active"; "release_on_reset"),
    rule("A4  Follow the heat request when heating is permitted"; "follow_heat_request")
  ] as $rules
| ($rules[] | "\(.title) – \(.status)"),
  (if any($rules[]; .status != "PROVED") then "" | halt_error(1)
   elif any($goals[]; proved | not) then
     "A supporting proof obligation is unproved. See build/wp.json.\n" | halt_error(1)
   else empty end)
