import { TrieNode } from "./node";
import { levenshtein } from "../levenshtein";

export type FindParams = {
  term: string;
  exact?: boolean;
  tolerance?: number;
};

export type FindResult = {
  [key: string]: Set<string>;
};

export class Trie {
  private root = new TrieNode("");

  insert(word: string, docId: string): void {
    const wordLength = word.length;
    let node = this.root;

    for (let i = 0; i < wordLength; i++) {
      const char = word[i];

      if (!node.children?.has(char)) {
        const newTrieNode = new TrieNode(char);
        newTrieNode.setParent(node);
        node.children!.set(char, newTrieNode);
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
      node = node.children!.get(char)!;

      if (i === wordLength - 1) {
        node.setEnd(true);
        node.docs.add(docId);
      }
    }
  }

  contains(word: string): boolean {
    let node = this.root;

    for (const char of word) {
      if (node?.children?.has(char)) {
        node = node.children.get(char)!;
      } else {
        return false;
      }
    }

    return node.end;
  }

  find({ term, exact, tolerance }: FindParams): FindResult {
    let node = this.root;
    const output: FindResult = {};

    for (const char of term) {
      if (node?.children?.has(char)) {
        node = node.children.get(char)!;
      } else if (!tolerance) {
        return output;
      }
    }
    
    // Resetting us back to the top of the tree to look at all the options 
    if (tolerance) {
      node = this.root;
    }
    findAllWords(node, output);

    function findAllWords(_node: TrieNode, _output: FindResult) {
      if (_node.end) {
        const [word, docIDs] = _node.getWord();

        if (exact && word !== term) {
          return output;
        }

        if (!(word in _output)) {
          if (tolerance) {
            // computing the absolute difference of letters between the term and the word
            const difference = Math.abs(term.length - word.length);

            if (difference <= tolerance) {
              // if the tolerance is set, we need to calculate the distance using levenshtein algorithm
              const distance = levenshtein(term, word);

              // if the distance is greater than the tolerance, we don't need to add the word to the output
              distance <= tolerance && (_output[word] = new Set());
            }
          } else {
            // prevent default tolerance not set
            _output[word] = new Set();
          }
        }
        const findResultSet: Set<string> = _output[word];
        if (docIDs?.size && findResultSet) {
          for (const doc of docIDs) {
            // check if findResultSet exists and then add the doc to it
            findResultSet.add(doc);
          }
        }
      }

      for (const childNode of _node.children?.values() ?? []) {
        findAllWords(childNode, _output);
      }
    }

    return output;
  }

  removeDocByWord(word: string, docID: string, exact = false): boolean {
    const root = this.root;
    if (!word) return false;

    function removeWord(node: TrieNode, _word: string, docID: string): boolean {
      const [nodeWord, docIDs] = node.getWord();

      if (node.end || (exact && node.end && nodeWord === word)) {
        node.removeDoc(docID);

        if (node.children?.size && docIDs.has(docID)) {
          node.end = false;
        }

        return true;
      }

      for (const childNode of node.children!.values()) {
        if (childNode) {
          removeWord(childNode, _word, docID);
        }
      }

      return false;
    }

    return removeWord(root, word, docID);
  }

  remove(word: string): boolean {
    const root = this.root;
    if (!word) return false;

    function removeWord(node: TrieNode, _word: string): boolean {
      if (node.end && node.getWord()[0] === word) {
        if (node.children?.size) {
          node.end = false;
        } else {
          node.parent!.deleteChildren();
        }

        return true;
      }

      for (const childNode of node.children?.values() ?? []) {
        removeWord(childNode, _word);
      }

      return false;
    }

    return removeWord(root, word);
  }
}
