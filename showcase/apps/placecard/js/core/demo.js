import { emptyPlan, DEFAULT_SETTINGS } from './plan.js';
import { parseGuests, guestsFromParties } from './importer.js';

const GUESTS = `
Maya Okafor & Theo Lindqvist | Wedding party
Priya Raman | Wedding party
Jonah Weiss | Wedding party
Sofia Marchetti | Wedding party
Ben Achebe | Wedding party
Hana Sato | Wedding party
Luis Ortega (gluten-free) | Wedding party
Dev Raman | College
Ella Weiss | School
Grace Okafor & Samuel Okafor | Maya's family
Adaeze Okafor (diabetic) | Maya's family
Chidi Okafor & Ngozi Okafor & Kemi Okafor (kids meal) & Tobi Okafor (kids meal) | Maya's family
Ifeoma Bello & Kunle Bello | Maya's family
Nnamdi Okafor | Maya's family
Zara Okafor | Maya's family
Amara Grant & Felix Grant | Maya's family
Uche Okafor & Bisi Okafor & Ada Okafor (kids meal) | Maya's family
Richard Lindqvist & Carol Lindqvist | Theo's family
Linda Hart & Paul Hart | Theo's family
Gary Lindqvist | Theo's family
Astrid Lindqvist (vegetarian) | Theo's family
Erik Lindqvist & Mia Lindqvist & Noor Lindqvist (kids meal) & Leo Lindqvist (kids meal) | Theo's family
Freya Lindqvist | Theo's family
Oskar Berg & Ingrid Berg | Theo's family
Nils Berg | Theo's family
Sven Holm & Karin Holm | Theo's family
Ravi Menon & Claire Menon | College
Tess Dubois & Marco Rossi | College
Marcus Lee & Jordan Lee | College
Ivy Chen | College
Sam Park & Jamie Park | College
Dana Wolfe | College
Kofi Mensah & Abena Mensah | College
Rosa Vega (vegan) | College
Will Turner | College
Nadia Haddad & Ezra Stone | College
Helen Brooks & Martin Brooks | Maya's work
Aisha Khan | Maya's work
Greg Novak | Maya's work
Yuki Tanaka (vegan) | Maya's work
Omar Farouk & Lina Farouk | Maya's work
Beth Cole | Maya's work
Tom Reyes | Theo's work
Kat Morgan & Alex Morgan | Theo's work
Raj Patel (vegetarian) | Theo's work
Simone Blanc | Theo's work
Derek Hall | Theo's work
Fiona Walsh & Liam Walsh | Theo's work
Joan Pike & Harold Pike | Neighbours
Edna Moss | Neighbours
Victor Petrov & Elena Petrov & Mila Petrov (kids meal) | Neighbours
Carlos Diaz & Ana Diaz | Neighbours
Jess Huang & Mark Huang | Climbing club
Pete Olsen | Climbing club
Rina Das | Climbing club
Quinn Avery | Climbing club
Kai Nakamura | Climbing club
Lou Ferris | Climbing club
Bea Lowell & Dom Lowell | School
Gwen Ito | School
Hugo Silva & Mara Silva | School
Pia Kraus | School
Ruth Adeyemi | School
`;

const WISHES = [
  ['never', 'Richard Lindqvist', 'Linda Hart'],
  ['never', 'Derek Hall', 'Beth Cole'],
  ['must', 'Edna Moss', 'Joan Pike'],
  ['next', 'Adaeze Okafor', 'Grace Okafor'],
  ['next', 'Astrid Lindqvist', 'Richard Lindqvist'],
  ['prefer', 'Astrid Lindqvist', 'Linda Hart'],
  ['prefer', 'Astrid Lindqvist', 'Erik Lindqvist'],
  ['next', 'Dana Wolfe', 'Ivy Chen'],
  ['prefer', 'Priya Raman', 'Dev Raman'],
  ['prefer', 'Jonah Weiss', 'Ella Weiss'],
  ['prefer', 'Grace Okafor', 'Linda Hart'],
  ['prefer', 'Kemi Okafor', 'Noor Lindqvist'],
  ['prefer', 'Ravi Menon', 'Kai Nakamura'],
  ['prefer', 'Rosa Vega', 'Simone Blanc'],
  ['prefer', 'Nils Berg', 'Will Turner'],
  ['prefer', 'Freya Lindqvist', 'Hana Sato'],
  ['prefer', 'Ella Weiss', 'Gwen Ito'],
  ['prefer', 'Dev Raman', 'Ravi Menon'],
  ['apart', 'Gary Lindqvist', 'Freya Lindqvist'],
  ['apart', 'Gary Lindqvist', 'Linda Hart'],
  ['apart', 'Gary Lindqvist', 'Dana Wolfe'],
  ['apart', 'Gary Lindqvist', 'Erik Lindqvist'],
  ['apart', 'Greg Novak', 'Aisha Khan'],
  ['next', 'Edna Moss', 'Joan Pike'],
];

export function demoPlan() {
  let k = 0;
  const makeId = (p) => `${p}${(k++).toString(36)}`;
  const plan = emptyPlan();
  plan.name = 'Maya & Theo — 14 June';
  plan.guests = guestsFromParties(parseGuests(GUESTS), makeId);

  plan.tables.push({ id: 'head', name: 'Head table', shape: 'head', seats: 8, x: 600, y: 78, rot: 0 });
  const xs = [170, 420, 670], ys = [270, 480, 690];
  let num = 1;
  for (const y of ys) for (const x of xs) {
    plan.tables.push({ id: `t${num}`, name: `Table ${num}`, shape: 'round', seats: 10, x, y, rot: 0 });
    num++;
  }
  plan.tables.push({ id: 'long', name: 'Long table', shape: 'long', seats: 12, x: 960, y: 520, rot: 90 });

  const byName = new Map(plan.guests.map((g) => [g.name, g.id]));
  plan.wishes = WISHES.map(([type, a, b], i) => ({ id: `w${i}`, type, a: byName.get(a), b: byName.get(b) }));

  for (const g of plan.guests.filter((g) => g.tag === 'Wedding party')) plan.locks[g.id] = { table: 'head' };
  plan.locks[byName.get('Maya Okafor')] = { seat: 'head:3' };
  plan.locks[byName.get('Theo Lindqvist')] = { seat: 'head:4' };
  plan.settings = { ...DEFAULT_SETTINGS };
  return plan;
}
