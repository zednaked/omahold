# What a reviewer can run without installing anything.
#
#   make test      everything below
#   make sim       the simulation, headless, two years on one seed
#   make i18n      both languages, the fallback, and key parity
#   make glyphs    every glyph the plugin draws, against what fonts cover
#   make hostile   what save.py refuses, in a throwaway $HOME
#   make deep      the relic from the tomb and the court of the deep
#   make halls     the hearth, the crystal, the game table and the traps
#   make presets   every preset built, checked against its blurb and played a year
#   make surfaces  what the panel and the corner window have to agree on
#   make lives     the chronicle read back as one dwarf's biography
#   make artifacts what a strange mood is about, and what it puts on the object
#   make stairs    going down, which has broken three times
#   make zmoves    every change of level, audited against what allowed it
#   make trade     the caravan, and the deal the player builds with it
#   make court     the infirmary, the pen and the crown
#
# A check on something the world rolls for reads several seeds: test/seeds.js.

.PHONY: test sim i18n hostile deep halls presets surfaces lives artifacts stairs zmoves glyphs trade court validate

test: sim i18n glyphs deep halls presets surfaces lives artifacts stairs zmoves trade court hostile

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

artifacts:
	@echo "== artifacts =="
	@node test/artifacts.js | tail -1

stairs:
	@echo "== stairs =="
	@node test/stairs.js | tail -1

zmoves:
	@echo "== trocas de nivel =="
	@node test/zmoves.js | tail -2

trade:
	@echo "== trade =="
	@node test/trade.js | tail -1

court:
	@echo "== infirmary, pen, crown =="
	@node test/court2.js | tail -1

glyphs:
	@echo "== glifos =="
	@node test/glyphs.js | tail -2

hostile:
	@echo "== save.py =="
	@/usr/bin/python3 test/hostile.py

validate:
	@omarchy plugin validate .
