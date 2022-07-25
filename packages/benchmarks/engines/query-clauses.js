import cronometro from "cronometro";
import { Lyra } from "@nearform/lyra";
import lines from "../dataset/divinaCommedia.json" assert { type: "json" };

const db = new Lyra({
  schema: {
    id: "string",
    txt: "string",
    author: {
      name: "string",
      lastName: "string",
      alive: "boolean",
      deathYear: "number",
    },
  },
});

for (const line of lines) {
  await db.insert({
    ...line,
    author: {
      name: "Dante",
      lastName: "Alighieri",
      alive: false,
      deathYear: Math.random() * 15 + 1321 - 15,
    },
  });
}

const testCases = {
  ["Lyra Search with boolean query clauses"]() {
    db.search({
      term: "nel mezzo del camin",
      where: {
        author: { alive: true },
      },
    });
  },
  ["Lyra Search with exact numeric query clauses"]() {
    db.search({
      term: "nel mezzo del camin",
      where: {
        author: {
          deathYear: {
            "=": 1321,
          },
        },
      },
    });
  },
  ["Lyra Search with range numeric query clauses"]() {
    db.search({
      term: "nel mezzo del camin",
      where: {
        author: {
          deathYear: {
            ">=": 1321,
          },
        },
      },
    });
  },

  ["Lyra Search without query clauses"]() {
    db.search({
      term: "nel mezzo del camin",
    });
  },
};

cronometro(testCases);

export default testCases;
