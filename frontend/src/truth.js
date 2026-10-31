// Truth Mode data and per-viewer stats (localStorage). See components/TruthMode.jsx.
export const TRUTH_CLAIMS = [
  { claim: "Octopuses have three hearts.", answer: true,
    why: "Two hearts pump blood through the gills and a third pumps it through the rest of the body." },
  { claim: "A day on Venus is longer than a year on Venus.", answer: true,
    why: "Venus takes about 243 Earth days to rotate once but only about 225 to orbit the Sun." },
  { claim: "Bananas are botanically berries.", answer: true,
    why: "A banana develops from a single flower with one ovary, which meets the botanical definition of a berry." },
  { claim: "Oxford University is older than the Aztec Empire.", answer: true,
    why: "Teaching at Oxford existed by 1096; the Aztec capital Tenochtitlan was founded in 1325." },
  { claim: "Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid of Giza.", answer: true,
    why: "The Great Pyramid dates to about 2560 BC; Cleopatra died in 30 BC, about 2,000 years before Apollo 11." },
  { claim: "Sharks have existed longer than trees.", answer: true,
    why: "The earliest sharks appear around 450 million years ago; the first trees around 385 million years ago." },
  { claim: "Venus is the hottest planet in the solar system.", answer: true,
    why: "Its thick carbon-dioxide atmosphere traps heat at around 465°C — hotter than Mercury, despite being farther from the Sun." },
  { claim: "Wombat droppings are cube-shaped.", answer: true,
    why: "Varying elasticity in the wombat's intestinal walls shapes its droppings into cubes." },
  { claim: "The Great Wall of China is visible from space with the naked eye.", answer: false,
    why: "The wall is long but only a few metres wide; astronauts report it is not visible from orbit without aid." },
  { claim: "Humans use only 10% of their brains.", answer: false,
    why: "Brain imaging shows activity across virtually every region, and damage to almost any area has effects." },
  { claim: "Goldfish have a three-second memory.", answer: false,
    why: "Experiments show goldfish can learn tasks and remember them for months." },
  { claim: "Lightning never strikes the same place twice.", answer: false,
    why: "Tall structures are struck repeatedly — the Empire State Building is hit around 20 times a year." },
  { claim: "Bats are blind.", answer: false,
    why: "All bat species can see; many also use echolocation, and some fruit bats see very well." },
  { claim: "Napoleon was unusually short.", answer: false,
    why: "He was about 5 ft 7 in (170 cm), around average for a Frenchman of his time; French inches caused the confusion." },
  { claim: "Bulls are enraged by the color red.", answer: false,
    why: "Bulls are red-green colorblind; they charge at the cape's movement, not its color." },
  { claim: "Sugar makes children hyperactive.", answer: false,
    why: "Double-blind studies have found no effect of sugar on children's behavior; expectations shape what parents see." },
  { claim: "Vikings wore horned helmets in battle.", answer: false,
    why: "No horned helmet has been found from Viking warfare; the image comes from 19th-century costume design." },
];

const STATS_KEY = "colosseo.truthStats";
const emptyStats = { played: 0, beforeRight: 0, afterRight: 0, judgeCalls: 0, judgeRight: 0 };

export function loadTruthStats() {
  try {
    return { ...emptyStats, ...JSON.parse(localStorage.getItem(STATS_KEY) || "{}") };
  } catch {
    return { ...emptyStats };
  }
}

export function saveTruthStats(stats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch { /* private mode */ }
}

export function randomClaim(exclude) {
  const pool = TRUTH_CLAIMS.filter((c) => c.claim !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

