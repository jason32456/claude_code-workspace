// Used when the Open Trivia DB API is unreachable.
const FALLBACK = [
  { question: "What is the chemical symbol for gold?", correct: "Au", incorrect: ["Ag", "Fe", "Gd"] },
  { question: "How many sides does a hexagon have?", correct: "6", incorrect: ["5", "7", "8"] },
  { question: "Which planet is known as the Red Planet?", correct: "Mars", incorrect: ["Venus", "Jupiter", "Saturn"] },
  { question: "Who painted the Mona Lisa?", correct: "Leonardo da Vinci", incorrect: ["Michelangelo", "Raphael", "Donatello"] },
  { question: "What is the capital of Japan?", correct: "Tokyo", incorrect: ["Beijing", "Seoul", "Bangkok"] },
  { question: "What year did World War II end?", correct: "1945", incorrect: ["1939", "1944", "1918"] },
  { question: "Which element has the atomic number 1?", correct: "Hydrogen", incorrect: ["Helium", "Carbon", "Oxygen"] },
  { question: "What is the largest ocean on Earth?", correct: "Pacific Ocean", incorrect: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean"] },
  { question: "How many bones are in the adult human body?", correct: "206", incorrect: ["185", "212", "230"] },
  { question: "What programming language was created by Brendan Eich in 1995?", correct: "JavaScript", incorrect: ["Python", "Java", "Ruby"] },
  { question: "Which country has the longest coastline in the world?", correct: "Canada", incorrect: ["Russia", "Australia", "Norway"] },
  { question: "What is the speed of light (approx.) in a vacuum?", correct: "300,000 km/s", incorrect: ["150,000 km/s", "450,000 km/s", "600,000 km/s"] },
  { question: "Who wrote '1984'?", correct: "George Orwell", incorrect: ["Aldous Huxley", "Ray Bradbury", "H.G. Wells"] },
  { question: "What is the powerhouse of the cell?", correct: "Mitochondria", incorrect: ["Nucleus", "Ribosome", "Lysosome"] },
  { question: "In which city is the Eiffel Tower located?", correct: "Paris", incorrect: ["London", "Rome", "Berlin"] },
  { question: "How many players are on a standard soccer team on the field?", correct: "11", incorrect: ["9", "10", "12"] },
  { question: "What is the square root of 144?", correct: "12", incorrect: ["10", "14", "16"] },
  { question: "Which gas makes up most of Earth's atmosphere?", correct: "Nitrogen", incorrect: ["Oxygen", "Carbon Dioxide", "Argon"] },
  { question: "Who was the first person to walk on the Moon?", correct: "Neil Armstrong", incorrect: ["Buzz Aldrin", "Yuri Gagarin", "John Glenn"] },
  { question: "What is the smallest country in the world by area?", correct: "Vatican City", incorrect: ["Monaco", "San Marino", "Liechtenstein"] },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getFallbackQuestions() {
  return shuffle(FALLBACK).slice(0, 10).map(q => ({
    question: q.question,
    correct: q.correct,
    answers: shuffle([q.correct, ...q.incorrect]),
    category: 'General Knowledge',
    difficulty: 'medium',
  }));
}
