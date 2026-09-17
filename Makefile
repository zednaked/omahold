# What a reviewer can run without installing anything.
#
#   make test      everything below
#   make sim       the simulation, headless, two years on one seed
#   make i18n      both languages, the fallback, and key parity
#   make hostile   what save.py refuses, in a throwaway $HOME
#   make deep      the relic from the tomb and the court of the deep
#   make halls     the hearth, the crystal, the game table and the traps
#   make presets   every preset built, checked against its blurb and played a year
#   make surfaces  what the panel and the corner window have to agree on
#   make lives     the chronicle read back as one dwarf's biography

.PHONY: test sim i18n hostile deep halls presets surfaces lives validate

test: sim i18n deep halls presets surfaces lives hostile

sim:
	@echo "== simulation =="
	@MAP=0 node test/run.js 7 2 | tail -4
	@node test/scenario.js 7 2 12 | grep -E '^(resiliência|[0-9]+ ticks)'

i18n:
	@echo "== languages =="
	@node test/i18n.js

deep:
	@echo "== the deep =="
	@node test/relic.js | tail -1
	@node test/court.js | tail -1

halls:
	@echo "== halls =="
	@node test/halls.js | tail -1

presets:
	@echo "== presets =="
	@node test/presets.js | tail -1

surfaces:
	@echo "== surfaces =="
	@node test/surfaces.js | tail -1

lives:
	@echo "== lives =="
	@node test/lives.js | tail -1

hostile:
	@echo "== save.py =="
	@/usr/bin/python3 test/hostile.py

validate:
	@omarchy plugin validate .
