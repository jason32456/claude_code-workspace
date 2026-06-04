const CATEGORY_IDS = {
  any: '',
  general: 9,
  books: 10,
  film: 11,
  music: 12,
  videogames: 15,
  nature: 17,
  science: 17,
  computers: 18,
  sports: 21,
  geography: 22,
  history: 23,
  anime: 31,
};

export async function fetchQuestions({ category = 'any', difficulty = 'medium' } = {}) {
  let url = 'https://opentdb.com/api.php?amount=10&type=multiple&encode=url3986';
  if (category !== 'any' && CATEGORY_IDS[category]) {
    url += `&category=${CATEGORY_IDS[category]}`;
  }
  if (difficulty !== 'any') {
    url += `&difficulty=${difficulty}`;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  if (data.response_code !== 0) throw new Error(`Trivia API response code: ${data.response_code}`);

  return data.results.map(q => ({
    question: decodeURIComponent(q.question),
    correct: decodeURIComponent(q.correct_answer),
    answers: shuffle([
      decodeURIComponent(q.correct_answer),
      ...q.incorrect_answers.map(a => decodeURIComponent(a)),
    ]),
    category: decodeURIComponent(q.category),
    difficulty: q.difficulty,
  }));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
