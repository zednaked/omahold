# Omahold

**A miniature dwarven hold that lives inside omarchy-shell.** · by ZeD

*[Leia em português](README.pt-BR.md)*

![The Omahold panel: one level of the map, the sidebar and the chronicle](preview.png)

An Omarchy plugin: a world of 48×30 cells with 8 levels of depth (z-levels),
seven dwarves with hunger, thirst, sleep, mood and trades, digging, farming,
brewing, crafting, strange moods and artifacts, migrants, caravans, goblin
ambushes, wolves in winter, kobold thieves, floods and magma. All of it drawn
in the colors of the active theme — changing the theme dresses the hold in
another climate.

While you work the world ticks slowly (a day of fortress time every few
minutes). When you open the panel it runs at four ticks a second. Nothing is
drawn without a visible surface, and one tick costs a fraction of a
millisecond on a 2014 MacBook.

```
omarchy plugin add https://github.com/zednaked/omahold.git --enable
# or, by hand:
cp -r . ~/.config/omarchy/plugins/zed.omahold && omarchy-shell shell rescanPlugins && omarchy plugin enable zed.omahold
```

**To remove:**

```
omarchy plugin disable zed.omahold
omarchy plugin remove zed.omahold
# or, by hand:
rm -rf ~/.config/omarchy/plugins/zed.omahold
# the saved hold lives outside the plugin folder; to take that too:
rm -rf ~/.local/state/omarchy/omahold
```

The plugin does not write to `shell.json` or to any configuration of yours —
what puts it on the bar is `omarchy plugin enable`, or your own hand.

**Dependencies:** pure QML, no binary and no network, plus `python3` — used
only for disk access (`save.py`), for the security reasons explained in
[Where the hold is written](#where-the-hold-is-written). Omarchy's own scripts
already use `python3`, so this adds nothing to the machine.

**Language:** English and Portuguese, in `≡ menu → Options → Language`. The
first load follows the system's `LANG`; after that your choice is remembered.

## Three surfaces

| Where | What |
|---|---|
| **The bar** | `☺ 7` — population. A dot lights up when something has happened since you last looked (a caravan, a death, an artifact). Click opens the world; right click toggles the corner window; the wheel changes its level. |
| **Corner window** (`m`, or right click on the bar) | A live 240×150 px view in the bottom-right corner, above your windows, without stealing focus. For keeping an eye on it while you do something else. Clicking it opens the panel. |
| **The panel** (`omarchy-shell omahold toggle`, or click the bar) | One level of the map, a sidebar, announcements, and the keys to give orders. |

A suggested binding for `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER SHIFT", "F", "omarchy-shell omahold toggle", "Omahold")
```

## Menu, presets and slots

`Esc` (with nothing to cancel) or the **≡ menu** button opens the menu; `Esc`
in it closes the panel.

- **New game**: Classic embark (7 dwarves, from nothing), Ready hold (12,
  waves every 15 days), Garrison (10, six in the militia, waves early and
  often), Quiet valley (a ready hold, no enemies), Siege (8, big waves from
  day 2). **Custom** picks the preset, the number of dwarves (4–24) and a
  numeric seed.
- **Save / Load**: five slots with the name, preset, in-game date, population
  and when it was written; `x` twice clears a slot for reuse. The autosave
  (`world.json`) stays independent of the slots.
- **View / inspect** (`v` in the menu; `o` in game cycles): Normal, **Light**
  (a heat map of the lighting), **Mood** (a halo per dwarf), **Access** (what
  can be walked to from the gate or from where the dwarves are; red = cut
  off). It is the same field that decides which designations come out red on
  the map. "Jump to an hour of the day" shows night and torches without
  waiting.
- **Options** (kept in `options.json`): pace with the panel closed (frozen, 1
  tick every 4 s / 2 s / 1 s, 4 per second), speed with the panel open, blocks
  or glyphs, the corner window, the population cap, enemies on or off, goblin
  waves calm / normal / brutal, and the language.

The same over IPC: `omarchy-shell omahold preset <classic|ready|garrison|peaceful|siege>`,
`saveSlot <n>`, `loadSlot <n>`, `slots`, `presets`.

## Workshop orders (`w`)

What comes out of a workshop comes off a queue, and the queue has two owners.

**The hold writes its own.** Every morning it looks at what it has and notes
what is missing: ale if the cellar is low, meals if there is raw food to
spare, bars if there is ore, a pick if a miner has none, armor for whoever
just joined the militia. If there is a still and there is food, somebody brews
— without being told. That is the minimum autonomy: given the infrastructure
and the material, they produce.

**You write yours** in the menu (`≡ menu → Orders`, or `w` to see the queue).
Your orders take precedence over the hold's — but precedence is not obedience.
Nobody drops what they are doing:

- **Need beats order.** Hunger, thirst and sleep come before any queue. The
  order waits for the dwarf to wake up.
- **Subsistence beats taste.** With an empty larder or a dry cellar nobody
  cuts gems — not the jeweler who loves cutting them, and not because you
  asked.
- **Inclination picks who does it.** Every dwarf has a trade they prefer and
  one they cannot stand (their sheet, on the Dwarves page, shows both).
  Between two orders they could take, they reach for the one they like.
  Measured: 12.6% of their work in the trade they love against 7.5% in the one
  they hate — the aversion weighs more than the preference, because forcing
  the preference cost 28% of the hold's output when it was tried.
- **They get it wrong.** Skill, mood, hunger and taste decide: an apprentice
  ruins one piece in ten, a master almost never. Ruined work eats the material
  and yields nothing. Three in a row and the dwarf **walks away from that
  trade for a day** — their sheet says so. Nobody ruins the hold's last ale:
  whoever handles the reserve is twice as careful.

The Legends page counts how many jobs were ruined. The curve is visible: in a
new hold it is about 140 in the first year and 50 in the fourth, as skill goes
up — and it climbs again when a batch of migrants arrives with no trade.

## The dead

Whoever falls stays where they fell, and every dwarf who walks past feels it.
They sort this out themselves: they choose a **graveyard** — a corner they can
walk to, away from the beds, the tables and the workshops, because that is
what makes a place a quiet one — and start carrying their companions there.
Each burial leaves a `†` on the map.

- Walking past the remains of someone with no grave: **−4** mood (−6 for a
  melancholic).
- Burying a companion as one should: **+3** for whoever carries them.
- With a graveyard open the loss weighs less on everyone: **−5** instead of
  **−7**, because they know where that one is going.

Nobody picks the place for you, and you do not have to designate anything. But
if the hold has no quiet reachable corner — everything occupied, or the only
isolated space with no stairs — the dead stay on the floor and it shows in
everyone's mood. The Legends page counts how many were buried.

## The baron

A hold worth 4000 draws a noble. It is one of your own dwarves, promoted — the
one with the most skill — and if they die the hold names another, which is the
only promotion in the game.

The baron **wants things**: another statue to look at, jewels in the treasury,
a fuller cellar, a drill yard, torches in the halls, prepared meals in the
larder. Each demand is counted from what the hold already had when it was
made, so "another statue" rather than "a statue" — a baron satisfied by what
you already own is not pressure. There is a season to meet it.

- Met: **+4** mood for everyone. A hold that satisfies its baron is a hold
  doing well, and it knows it.
- Unanswered after twenty days: **−3** for everyone, and the Legends page
  records it.

Some demands the hold meets on its own (the kitchen keeps making meals); others
need you to build something. The baron and the open demand show on the Here
page, with the days left.

## Milestones, and winning

There are six things a hold does on its way up, each announced when it happens
and dated in the Legends page:

| milestone | what it takes |
|---|---|
| an artifact | a strange mood runs its course and names something |
| 6000 in worth | everything the hold owns and has built |
| eighteen dwarves | migrants come by wealth, and they need beds and food to stay |
| three attacks repelled | the militia holds three times |
| reach the magma | somebody digs a shaft all the way to level 0 |
| five years standing | the hold is still there |

Doing all six makes the hold **legendary**, which is this game's version of
winning: the world keeps going (there is no screen to stop at), but the date
is recorded and the reckoning is written then rather than only when everyone
is dead. A fallen hold gets the same reckoning, which is what a ruin deserves
instead of a last death notice.

Measured over eight seeds and six years with nobody touching anything: the
artifact and the three attacks land 8 times out of 8, eighteen dwarves 6, the
worth 5, five years 3 — and **the magma 0, legendary 0**. Five of the six come
with a healthy hold; the one that closes the game asks you to dig where it is
dangerous.

## Metal grades

The deeper the ore, the better the metal: **copper** in the shallow levels,
**iron** below them, **steel** in the last level before the magma. A bar keeps
the grade of the ore it was smelted from, gear keeps the grade of the bar, and
better gear hits harder and absorbs more — so the shaft that earns the magma
milestone is also what lets a hold meet the ninth wave in something better
than copper. Arms and armor are always forged from the best bar in the hold,
not the nearest one.

## Siege

Goblins who cannot get through the door used to give up after a day, and the
wave counted as repelled having cost nothing: locking the doors (`L`) was a
free win. Now they sit outside for up to eight days, and while there are
goblins alive on the surface with none of them inside, the hold is **under
siege** — nobody works above ground, which takes the surface fields, the shrub
gathering and the woodcutting with it.

Four seeds over two years, with and without locking:

| | repelled | deaths | pop | days besieged |
|---|---|---|---|---|
| doors open | 11.0 | 13.0 | 13.8 | 2.0 |
| doors locked | 10.5 | 14.5 | 9.8 | 21.2 |

Deaths go **up** when you lock, which is the point: nobody is lost to a goblin
and the bill arrives as privation instead. The decision has two sides now.

## How it is played

It is Dwarf Fortress in miniature: you do not control dwarves, you
**designate** what you want done and they decide who does it.

1. Mark **stairs** (`s`) at the wagon: on a floor, that already marks the
   descent (the cell and the rock below it). To go deeper, go down (`>`) and
   press `s` again over the stairs. Stairs marked in rock are dug from any
   floor that exists above them.
2. **Dig** (`d`) a hall: Enter marks a corner, Enter again applies; or drag
   with the mouse.
3. **Build** (`b`): beds (`b b`), tables (`b t`), a still (`b d`), a workshop
   (`b o`), a stockpile (`b e`). Beds and tables consume logs (fell trees with
   `c`); the still and the workshop consume stone (which comes from digging).
4. **Plant** (`b f`) on soil, grass or cave moss. A stone floor will not do.
   Once there is ore, a **smelter** (`b u`) and a **forge** (`b j`) turn it
   into picks, axes, weapons and armor; **torches** (`b l`) light the halls; a
   **drill yard** (`b r`) gives the militia somewhere to train.
5. Designations **in red** have no path to them for now (missing stairs, or
   access on the same level); the Here page explains. They are retried on
   their own.
6. Watch. Dwarves eat, drink mushroom ale (or water, and complain), sleep in a
   bed or on the floor, talk at the tables, grieve when someone dies. A mood
   low enough becomes a tantrum; a tantrum witnessed lowers everyone else's
   mood. That is how a hold falls.

Take care: digging under the stream **floods**; digging to level 0 finds
**magma**; the caverns (level 1) have moss, giant mushrooms and water.

Key hints live in the footer; the active tool shows in a pill over the map and
warnings in a toast at the center.

### Keys

| | |
|---|---|
| arrows / `hjkl` | move the cursor (`Shift`: 5 cells) |
| `<` `>` `,` `.` PgUp/PgDn, wheel | up / down one level |
| `Enter` | mark a corner; again applies. In look mode: selects what is under the cursor |
| mouse | drag applies the tool; right click selects |
| `d` `s` `c` | dig, stairs (on a floor: digs the descent; over stairs: keeps going down), chop |
| `b` + letter | build: `b` bed `t` table `f` plot `e` stockpile `p` door `w` wall `l` torch `o` workshop `d` still `c` kitchen `u` smelter `j` forge `g` jeweler `r` drill yard `s` statue |
| `x` `r` | cancel a designation, remove a building |
| `]` `[` `f` | next/previous dwarf; follow the selected one |
| `Space` `+` `-` | pause; speed 1×/2×/4× |
| `L` | lock the doors: goblins, wolves and kobolds cannot pass |
| `g` | blocks ↔ glyphs (the classic look) |
| `m` | corner window |
| `Tab` `u` `i` `w` `y` `?` | pages: Dwarves, Here, **Orders**, Legends, Help |
| `Home` | back to the wagon |
| `n` | New game menu |
| `Shift+S` | Save menu |
| `Esc` | leave the tool / menu |

## The showcase scenario

`omarchy-shell omahold scenario 12` (or **New game → Ready hold** in the menu,
`n`) swaps the world for a finished hold, built to watch every loop run and to
measure how much it can take:

| Level | What is there |
|---|---|
| surface | a walled gate with a door south of the stairs |
| −1 | 12 plots, a larder with 40 food, 12 meals and 40 drinks, torches |
| −2 | a dining hall with 12 tables, a kitchen, two stills, statues, torches |
| −3 | a dormitory (beds for everyone and four more), a smelter, a forge, two workshops, two drill yards, a stockpile with logs, stone, ore, bars and spare gear |
| mines | galleries with every vein in reach already designated, with access tunnels |

The dwarves arrive with trades: miners with picks, woodcutters with axes,
farmers, a brewer, a smith, a mason. A third of them form the **militia**,
already armed and armored, and drill in the yard when there is nothing else to
do.

The full loop: fields → food → a meal (kitchen) and ale (still); tree → log →
bed/table/door/torch; digging → stone → buildings and crafts; ore →
**smelter** → bar → **forge** → pick, axe, weapon, armor (by need: whoever has
none first); rough gem (mined from `☼` in the rock) → **jeweler** → cut gem →
jewel, the most valuable goods for the caravan. **Light** is simulated per
cell: the sun rises and sets (long days in summer, short in winter, weaker in
the rain), each torch **flickers** and throws warm light that fades with
distance and **does not cross rock or wall** (nor turn a corner), and magma
glows red. Only the face of a wall that touches open floor takes light; rock
and wall are drawn as masonry with a bright line on the edge facing the floor,
so the outline of a room is crisp and it is obvious where the solid is. The
surface darkens at night to a bluish moonlight, with tinted dawn and dusk; the
underground stays dim where there is no torch. Sleeping and eating in the dark
are worth less; the Here page shows light as a percentage at the cursor. When
the ore runs out the hold prospects the nearest vein on its own — the whole
vein, with an access tunnel — and when logs run low it marks trees.

None of it piles up forever: the larder holds about ten food per dwarf and
what goes beyond that **rots** (a prepared meal does not, which is why the
kitchen is worth the stone it costs), and **pick, axe, weapon and armor wear
out** until they break. A broken pick is a reason to go back to the mine, and
it is what keeps the smelter and the forge lit in the third year instead of
leaving them ornamental. The Legends page counts what spoiled and what broke.

The **first goblin wave arrives in six days** and then every fifteen, each one
larger (4, 5, 6, 7… up to nine, veterans from the fifth). The scoreboard is on
the Legends page: waves, repelled, goblins killed, dwarves lost. The gear of
whoever falls stays on the floor for the next one. Over two years of testing
with no intervention, across eight seeds (`node test/scenario.js <seed> 2`),
12 dwarves repel the 11 waves, lose about 9 and end with about 16 — migrants
replace more than the goblins take. Locking the doors (`L`) changes
everything: goblins cannot pass and go home.

If the last dwarf dies anyway, the hold **falls**: the panel marks it, the
Legends page records the end, and the world stops sending waves, caravans and
migrants. Losing is fun, but a ruin should not keep announcing victories.

`omarchy-shell omahold raid` brings a wave now.

## IPC

```
omarchy-shell omahold toggle|open|close|peek|pause|save|status
omarchy-shell omahold speed 1|2|4
omarchy-shell omahold scenario 12         # a ready hold with N dwarves and goblin waves
omarchy-shell omahold raid                # a wave now
omarchy-shell omahold hour 22             # jump to an hour of the day (0-24)
omarchy-shell omahold view light          # normal | light | mood | access
omarchy-shell omahold background 2000     # ms per tick with the panel closed; 0 freezes
omarchy-shell omahold newWorld ""         # or a numeric seed
```

Inline options on the widget entry in `~/.config/omarchy/shell.json`:
`{ "id": "zed.omahold", "backgroundMs": 2000, "popCap": 20, "peek": false }`.

## Where the hold is written

The world lives in `~/.local/state/omarchy/omahold/world.json`, saved every
90 s and when the panel closes; it survives shell restarts. The five slots,
their index and the options sit in the same directory, mode 700, each file
600.

All of it goes through one place: `save.py`, always invoked as
`/usr/bin/python3 -I save.py <mode> <paths relative to $HOME>`, with a closed
environment and no execute bit. It used to be three different ways in —
`sh -c 'cat …'` to read, `FileView` to write and `rm -f` to clear a slot — and
none of them could check the file it was about to touch and then touch that
same file. That is what the marketplace security review blocked
[omarchy-ganja](https://github.com/zednaked/omarchy-ganja) for twice: in shell
every command resolves the path again, so a check and a use are two
resolutions and what was checked can be exchanged in between.

The helper descends from `$HOME` component by component with `openat` +
`O_NOFOLLOW`, validates each directory on the descriptor itself, and holds
that descriptor through the read, the write, the `fsync` and the `renameat`.
It refuses anything that is not a regular file of yours with a single link,
caps at 1 MiB with a five-second deadline, and can only ever name the plugin's
own seven files. `python3 test/hostile.py` runs the hostile cases in a
throwaway `$HOME` — FIFO, symlink mid-path, hardlink, a 2 MiB save, a planted
temporary, a name outside the list: 40 checks.

## What is simulated, and what is not

**It is**: the ore → bar → tools/weapons/armor chain, cooking, torches and
light, an automatic militia with drills, armor in combat, the showcase
scenario with waves; an economy with drains — raw food rots past the larder's
capacity (prepared meals keep) and pick, axe, weapon and armor wear out with
use until they break, so the mine and the forge have a reason to keep running
after the first year; an order queue the hold writes itself and the player
adds to; dwarves with an inclination and an aversion per trade, who ruin work,
get frustrated and walk away from the bench for a day; a graveyard the dwarves
choose themselves, burial of the dead and the weight of leaving them unburied;
terrain with slopes (implicit ramps), soil/rock/ore/gems, a stream, caverns, a
magma sea; A* in 3D with stairs and slopes; seven needs and trades;
designations for digging, stairs, chopping and building; farming with growth,
a still, a workshop (crafts and weapons from ore), stockpiles and hauling;
claimed beds, meals at a table; thoughts with weight and mood with drift,
tantrums, melancholy (and recovery), murderous rage; strange moods that claim
a workshop, demand a material and produce a named artifact; migrants by wealth
and a population cap; an autumn caravan that buys crafts and gems and leaves
supplies; ambushes scaled by wealth; wolves in winter; kobolds; combat with
skill and weapons; lockable doors; liquids that advance through gaps on a
finite budget; day and night, rain and snow; a chronicle and a memorial.

**It is not** (on purpose, at this scale): real hydraulics (water levels and
pressure), cave-ins, temperature, trading with haggling, nobles, domestic
animals, external sites, and Dwarf Fortress's labor screen — nobody is
assigned to be a baker: each dwarf has a trade they prefer and one they cannot
stand, and they sort themselves out. Each dwarf is a single glyph with no
limbs — a wound is just a number.

## References

This is a "DF-like" in the sense of
[Dwarf Fortress](https://en.wikipedia.org/wiki/Dwarf_Fortress): a world in
vertical slices, indirect orders, characters with emergent stories, and the
rule that losing is fun. Similar things at a smaller scale that served as
comparison: [DeepForge](https://minitech.itch.io/deep-forge) (an ASCII colony
with seven dwarves), [Albert's ASCII Dwarfs Simulation](https://albertfreeman.itch.io/alberts-dwarfs-simulation)
(simulation only, no game), [Undholm](https://store.steampowered.com/app/982060/Undholm/).
The idea of a world running in the corner of the screen while you work comes
from [Taskbar Colony](https://store.steampowered.com/app/5056060) and
[Desktop Colony](https://store.steampowered.com/app/3825610); the idea of a
plugin that lives at the bottom of the shell, from Omalava and
[Omaland](https://github.com/bobby-nicholas/omaland) for omarchy-shell. The
[Omarchy plugin catalog](https://plugins.omarchy.org/) had no game or
simulation when this was written.

## Development

```
make test      everything below
make sim       the simulation, headless
make i18n      both languages, the fallback, and key parity
make hostile   what save.py refuses, in a throwaway $HOME
make validate  omarchy plugin validate .
```

`sim.js` is plain JavaScript, no QML: `node test/run.js [seed] [years]` plays a
scripted hold and prints the chronicle, the statistics and ASCII maps of three
levels. `node test/scenario.js [seed] [years] [dwarves]` runs the ready hold
and prints the wave scoreboard — it is what the balance figures above are
measured with. `test/debug.js` and `test/debug2.js` trace paths and job
transitions — that is how it was found that dwarves were dying of thirst
because `step()` confused "still walking" with "blocked".

Measure across twelve seeds or more, never one: any new `chance()` shifts how
the RNG is consumed and changes the whole trajectory, so a single seed will
tell you a mechanism did something when it did nothing at all.

Files: `manifest.json` · `World.qml` (singleton: the clock, saving, the
palette, the language) · `sim.js` (the world) · `I18n.js` (every word, in both
languages) · `save.py` (the only thing that touches the disk) · `palette.js`
(theme → map colors) · `Fort.qml` (the panel) · `Service.qml` (the corner
window) · `BarWidget.qml`.
