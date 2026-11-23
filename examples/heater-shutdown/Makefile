CC ?= cc
CFLAGS ?= -O2
CORE = src/sensors.c src/latch.c src/heater.c src/controller.c
FRAMAC ?= $(if $(wildcard .tools/bin/frama-c),.tools/bin/frama-c,frama-c)
MACHDEP ?= macos_arm
MODEL_FLAGS = $(CPPFLAGS) $(CFLAGS) -std=c11 -Iinclude
FRAMAC_FLAGS = -machdep $(MACHDEP) -cpp-extra-args='$(MODEL_FLAGS)'
COMPILE_DEMO = $(CC) $(MODEL_FLAGS) -Wall -Wextra -Wpedantic -Werror $(CORE) demo/simulation.c

.PHONY: demo verify diagnose test-build testversion build/simulation

demo: build/simulation
	@./build/simulation

build/simulation: | build
	@$(COMPILE_DEMO) -o $@

test-build testversion: verify
	@$(COMPILE_DEMO) -o build/$@
	@echo "The verified test build is available at build/$@."

verify: | build
	@echo "WP is checking the four heater controller requirements."
	@set -eu; \
	report=$$(mktemp build/wp.XXXXXX); \
	trap 'rm -f "$$report" "$$report.log"' EXIT; \
	if ! "$(FRAMAC)" $(FRAMAC_FLAGS) $(CORE) -inline-calls=@all \
		-wp -wp-fct controller_step -wp-prop @ensures,@assert,@terminates,@exits \
		-wp-rte -wp-prover qed,z3 -wp-timeout 5 -wp-cache none \
		-wp-report-json "$$report" >"$$report.log" 2>&1; then \
		cat "$$report.log" >&2; exit 1; \
	fi; \
	passed=false; \
	if jq -rs -f tools/wp-status.jq "$$report"; then passed=true; fi; \
	mv "$$report" build/wp.json; \
	mv "$$report.log" build/wp.log; \
	if [ "$$passed" = true ]; then \
		echo "PASSED – WP proved all four requirements and their supporting proof obligations."; \
	else \
		echo "FAILED – the proof is incomplete. Eva will analyze the simulation."; \
		$(MAKE) --no-print-directory diagnose; \
		exit 1; \
	fi

diagnose:
	@"$(FRAMAC)" $(FRAMAC_FLAGS) $(CORE) demo/simulation.c -kernel-verbose 0 \
		-eva -eva-auto-loop-unroll 32 -eva-verbose 0 -eva-msg-key callstacks

build:
	mkdir -p $@
