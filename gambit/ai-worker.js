// Runs the AI search off the main thread so the board never freezes while
// the bot "thinks" at higher difficulties.
import { pickAIMove } from './ai.js';

self.onmessage = (event) => {
  const { state, difficulty } = event.data;
  const move = pickAIMove(state, difficulty);
  self.postMessage({ move });
};
