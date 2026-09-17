# What a reviewer can run without installing anything.
#
#   make test      everything below
#   make sim       the simulation, headless, two years on one seed
#   make i18n      both languages, the fallback, and key parity
#   make hostile   what save.py refuses, in a throwaway $HOME

.PHONY: test sim i18n hostile validate

test: sim i18n hostile

sim:
	@echo "== simulation =="
	@MAP=0 node test/run.js 7 2 | tail -4
	@node test/scenario.js 7 2 12 | grep -E '^(resiliência|[0-9]+ ticks)'

i18n:
	@echo "== languages =="
	@node test/i18n.js

hostile:
	@echo "== save.py =="
	@/usr/bin/python3 test/hostile.py

validate:
	@omarchy plugin validate .
