// Five nights. Each one adds exactly one idea, and the reef generator settings
// are chosen so the new idea is unavoidable — night 4 makes you cross open sand
// because there is a channel of it between you and the food.

export const NIGHTS = [
  {
    name: 'THE SHALLOWS',
    newThing: 'YOUR ARMS',
    line: 'Warm water over a broken bottom. Nothing out here hunts you yet — ' +
          'so spend the night finding out what your arms do when you are not watching them.',
    quota: 3,
    duration: 165,
    crabs: 14,
    clams: 0,
    predators: [],
    reef: { size: 22, relief: 0.9, boulders: 60, crevices: 10, morayChance: 0, coral: 1.0, grass: 1.1, caustics: 0.22 },
  },
  {
    name: 'RUBBLE FLATS',
    newThing: 'THE GROUPER',
    line: 'A grouper works this flat, and it does not need to see you clearly — ' +
          'it only needs to keep being a little bit suspicious. Match the ground and stop moving.',
    quota: 5,
    duration: 185,
    crabs: 16,
    clams: 3,
    predators: ['grouper'],
    reef: { size: 23, relief: 1.0, boulders: 70, crevices: 12, morayChance: 0.10, coral: 1.05, grass: 0.9, caustics: 0.13 },
  },
  {
    name: 'CREVICE GARDEN',
    newThing: 'MORAYS · CLAMS',
    line: 'Every hole in this reef has something in it. Your arms will find that out on their own, ' +
          'and a moray does not let go. Clams take two arms and both of them have to stay.',
    quota: 7,
    duration: 200,
    crabs: 14,
    clams: 8,
    predators: ['grouper', 'jack'],
    reef: { size: 24, relief: 1.25, boulders: 85, crevices: 18, morayChance: 0.34, coral: 1.2, grass: 0.8, caustics: 0.17 },
  },
  {
    name: 'SAND CHANNEL',
    newThing: 'REEF SHARK · INK',
    line: 'The food is on the far side of a scoured sand channel, and there is a reef shark in it. ' +
          'You cannot out-hide a shark — it reads movement twice as hard as anything else out here.',
    quota: 9,
    duration: 215,
    crabs: 18,
    clams: 8,
    predators: ['shark', 'grouper', 'jack'],
    reef: { size: 26, relief: 1.1, boulders: 85, crevices: 16, morayChance: 0.28, coral: 1.0, grass: 0.75, channel: 7, caustics: 0.16 },
  },
  {
    name: 'THE TRAP LINE',
    newThing: 'TRAPS · A TORCH',
    line: 'Someone has laid pots along the reef and come back at night to check them. ' +
          'There is a lobster in every trap, and a torch beam that makes camouflage meaningless.',
    quota: 11,
    duration: 235,
    crabs: 16,
    clams: 8,
    predators: ['shark', 'grouper', 'jack', 'grouper'],
    traps: 4,
    torch: true,
    reef: { size: 26, relief: 1.15, boulders: 90, crevices: 18, morayChance: 0.30, coral: 1.1, grass: 0.7, caustics: 0.13 },
  },
];
