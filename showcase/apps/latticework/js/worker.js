// Puzzle generation runs here so a slow Expert carve never freezes the UI.
import { generatePuzzle } from './generator.js';

self.onmessage = (e) => {
  const { requestId, tier, seed } = e.data;
  const result = generatePuzzle(tier, seed);
  self.postMessage({ requestId, ...result });
};
