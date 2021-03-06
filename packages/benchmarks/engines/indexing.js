import cronometro from "cronometro";
import { Lyra } from "@nearform/lyra";
import lines from "../dataset/divinaCommedia.json" assert { type: "json" };

const testCases = {
  ['Indexing Divina Commedia, "id" and "txt" indexes']() {
    const db = new Lyra({
      schema: {
        id: "string",
        txt: "string",
      },
    });

    return async function () {
      for (const line of lines) {
        await db.insert(line);
      }

      return db;
    };
  },
  ['Indexing Divina Commedia, "txt" index only']() {
    const db = new Lyra({
      schema: {
        txt: "string",
      },
    });

    return async function () {
      for (const { txt } of lines) {
        await db.insert({
          txt,
        });
      }

      return db;
    };
  },
};

cronometro(testCases);

export default testCases;
