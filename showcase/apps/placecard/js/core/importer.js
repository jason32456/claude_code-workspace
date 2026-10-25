// One party per line: "Ana Ruiz (veg) & Tom Ruiz | Bride's family".
// Members split on & or comma; an optional | tag applies to the whole line;
// a trailing (note) on a name is its dietary note.

let counter = 0;
export const newId = (prefix) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function parseGuests(text) {
  const parties = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [who, tagPart] = line.split('|');
    const tag = (tagPart || '').trim();
    const members = who
      .split(/\s*(?:&|,|\band\b|\+)\s*/i)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const m = s.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
        return m ? { name: m[1].trim(), diet: m[2].trim() } : { name: s, diet: '' };
      })
      .filter((m) => m.name);
    if (members.length) parties.push({ tag, members });
  }
  return parties;
}

export function guestsFromParties(parties, makeId = newId) {
  const guests = [];
  for (const p of parties) {
    const party = p.members.length > 1 ? makeId('p') : '';
    for (const m of p.members) guests.push({ id: makeId('g'), name: m.name, diet: m.diet, tag: p.tag, party });
  }
  return guests;
}
