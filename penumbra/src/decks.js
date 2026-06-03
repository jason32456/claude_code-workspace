// Deck/card management + starter deck data
import { putDeck, putCard, getDecks, getCards } from './storage.js';
import { State } from './fsrs.js';

export function newCard(deckId, front, back) {
  return {
    id: crypto.randomUUID(),
    deckId,
    front,
    back,
    state: State.New,
    difficulty: 0,
    stability: 0,
    due: new Date().toISOString(),
    lastReview: null,
    reps: 0,
    lapses: 0,
    seededAt: null,   // set when placed in a wind-down session
    morningDue: false // set to true when targeted for wake-up recall
  };
}

export function newDeck(name, description = '') {
  return { id: crypto.randomUUID(), name, description, createdAt: new Date().toISOString() };
}

// Seed the database with starter decks on first run
export async function seedStarterDecks() {
  const existing = await getDecks();
  if (existing.length > 0) return;

  const spanishDeck = newDeck('Common Spanish Words', '50 high-frequency Spanish words with English translations');
  await putDeck(spanishDeck);

  const spanishWords = [
    ['el', 'the (masculine)'], ['la', 'the (feminine)'], ['y', 'and'],
    ['de', 'of / from'], ['en', 'in / on'], ['que', 'that / what'],
    ['es', 'is (ser)'], ['un', 'a / an (masc.)'], ['no', 'no / not'],
    ['con', 'with'], ['se', 'himself / herself / itself'],
    ['por', 'by / for / through'], ['su', 'his / her / their'],
    ['lo', 'it / him (direct object)'], ['para', 'for / in order to'],
    ['como', 'like / as / how'], ['más', 'more'], ['pero', 'but'],
    ['una', 'a / an (fem.)'], ['si', 'if'], ['me', 'me / myself'],
    ['todo', 'all / everything'], ['muy', 'very'], ['ya', 'already / now'],
    ['cuando', 'when'], ['hay', 'there is / there are'],
    ['tiempo', 'time / weather'], ['también', 'also / too'],
    ['desde', 'since / from'], ['ahora', 'now'], ['bien', 'well / good'],
    ['donde', 'where'], ['gran', 'great / big'], ['mismo', 'same / self'],
    ['porque', 'because'], ['antes', 'before / earlier'],
    ['entre', 'between / among'], ['después', 'after / later'],
    ['siempre', 'always'], ['vida', 'life'], ['casa', 'house / home'],
    ['año', 'year'], ['día', 'day'], ['noche', 'night'],
    ['agua', 'water'], ['amor', 'love'], ['gente', 'people'],
    ['quiero', 'I want (querer)'], ['puedo', 'I can (poder)'],
    ['saber', 'to know (a fact)']
  ];

  for (const [front, back] of spanishWords) {
    await putCard(newCard(spanishDeck.id, front, back));
  }

  const anatomyDeck = newDeck('Human Body Systems', 'Key facts about major organ systems');
  await putDeck(anatomyDeck);

  const anatomyCards = [
    ['What does the heart do?', 'Pumps blood through the circulatory system via rhythmic contractions'],
    ['How many chambers does the heart have?', 'Four: right atrium, right ventricle, left atrium, left ventricle'],
    ['What is the largest organ?', 'The skin (integumentary system)'],
    ['What does the liver do?', 'Detoxifies blood, produces bile, stores glycogen, makes clotting factors'],
    ['What is the function of the kidneys?', 'Filter blood, produce urine, regulate fluid and electrolyte balance'],
    ['What does the pancreas produce?', 'Insulin and glucagon (hormones) plus digestive enzymes'],
    ['What is the role of the small intestine?', 'Absorbs most nutrients from digested food'],
    ['What is the diaphragm?', 'Dome-shaped muscle below the lungs that drives breathing'],
    ['What are neurons?', 'Nerve cells that transmit electrical and chemical signals'],
    ['What is the function of red blood cells?', 'Transport oxygen from lungs to tissues via hemoglobin'],
    ['What is the lymphatic system?', 'Network that drains excess fluid, filters pathogens, and supports immunity'],
    ['What does the cerebellum control?', 'Balance, coordination, and fine motor movements'],
    ['What are the three types of muscle?', 'Skeletal (voluntary), cardiac (heart), and smooth (organs/vessels)'],
    ['What is the role of the thyroid?', 'Regulates metabolism, growth, and energy use via thyroid hormones'],
    ['What is homeostasis?', 'The body\'s ability to maintain a stable internal environment'],
    ['What is the function of alveoli?', 'Tiny air sacs in lungs where gas exchange (O₂ / CO₂) occurs'],
    ['What is synovial fluid?', 'Lubricating fluid inside joint capsules that reduces friction'],
    ['What does DNA stand for?', 'Deoxyribonucleic acid — the molecule encoding genetic information'],
    ['What is the role of mitochondria?', 'Produce ATP (energy) through cellular respiration'],
    ['What is the blood-brain barrier?', 'Selective barrier that protects the brain from most substances in blood']
  ];

  for (const [front, back] of anatomyCards) {
    await putCard(newCard(anatomyDeck.id, front, back));
  }
}
