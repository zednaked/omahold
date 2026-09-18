// Reading one seed is not reading the mechanism.
//
// Most of what the hold does has a coin flip in it somewhere: the caravan
// offers stock on a chance, a mood strikes on a chance, a goblin hits or does
// not. A check written against a single seed passes because that seed happened
// to roll well, and goes red the first time an unrelated change moves the
// random sequence along — the pen check went red on a change to how dwarves
// walk down a hillside, which touches neither caravans nor pens.
//
//   const { onAnySeed } = require("./seeds.js")
//   const got = onAnySeed((seed) => { ...build and run...; return beasts > 0 })
//   check(!!got, "the caravan brings livestock" + (got ? " (seed " + got.seed + ")" : ""))
//
// Use `onAnySeed` for "this can happen" and `onEverySeed` for "this always
// holds". Neither hides a real regression: a change that breaks the mechanism
// breaks it on every seed.
const SEEDS = [7, 3, 11, 23, 31]

// Runs fn(seed) until one returns something truthy. Gives back { seed, value }
// or null if none of them did.
function onAnySeed(fn, seeds) {
  const list = seeds || SEEDS
  for (const seed of list) { const value = fn(seed); if (value) return { seed, value } }
  return null
}

// Runs fn(seed) for all of them. Gives back the first { seed, value } that came
// back falsy, or null when every seed held.
function onEverySeed(fn, seeds) {
  const list = seeds || SEEDS
  for (const seed of list) { const value = fn(seed); if (!value) return { seed, value } }
  return null
}

module.exports = { SEEDS, onAnySeed, onEverySeed }
