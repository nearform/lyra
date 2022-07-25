import type { queueAsPromised } from "fastq";
import { nanoid } from "nanoid";
import * as fastq from "fastq";
import { Trie } from "./prefix-tree/trie";
import * as ERRORS from "./errors";
import { tokenize } from "./tokenizer";
import {
  binarySearch,
  formatNanoseconds,
  getNanosecondsTime,
  setIntersection,
  setSubtraction,
} from "./utils";
import { Language, SUPPORTED_LANGUAGES } from "./stemmer";
import type {
  Nullable,
  NumberComparison,
  ResolveSchema,
  SearchProperties,
  WhereParams,
} from "./types";
import { SortedQueue } from "./sorted-queue";
import { QueueNode } from "./sorted-queue/node";

export type PropertyType = "string" | "number" | "boolean";

export const allowedNumericComparison = [">=", ">", "=", "<", "<="] as const;

export type PropertiesSchema = {
  [key: string]: PropertyType | PropertiesSchema;
};

export type LyraProperties<
  TSchema extends PropertiesSchema = PropertiesSchema
> = {
  schema: TSchema;
  defaultLanguage?: Language;
  stemming?: boolean;
};

export type LyraDocs<TDoc extends PropertiesSchema> = Map<
  string,
  ResolveSchema<TDoc>
>;

export type SearchParams<TSchema extends PropertiesSchema> = {
  term: string;
  properties?: "*" | SearchProperties<TSchema>[];
  limit?: number;
  offset?: number;
  exact?: boolean;
  tolerance?: number;
  where?: WhereParams<TSchema>;
};

export type InsertConfig = {
  language: Language;
  stemming: boolean;
};

type LyraIndex = Map<string, Trie>;
type LyraNumbericIndex = Map<string, SortedQueue<Set<string>>>;
type LyraBoolIndex = Map<string, Set<string>>;

type QueueDocParams<TTSchema extends PropertiesSchema> = {
  id: string;
  doc: ResolveSchema<TTSchema>;
  config: InsertConfig;
};

type SearchResult<TTSchema extends PropertiesSchema> = Promise<{
  count: number;
  hits: RetrievedDoc<TTSchema>[];
  elapsed: string;
}>;

type RetrievedDoc<TDoc extends PropertiesSchema> = ResolveSchema<TDoc> & {
  id: string;
};

type SearchIDSParams<TSchema extends PropertiesSchema> =
  SearchParams<TSchema> & {
    index: string;
  };

type GetDocumentFromWhereParams = {
  boolIndices: string[];
  numericIndices: string[];
};

export class Lyra<TSchema extends PropertiesSchema = PropertiesSchema> {
  private defaultLanguage: Language = "english";
  private schema: TSchema;
  private docs: LyraDocs<TSchema> = new Map();
  private index: LyraIndex = new Map();
  private numericIndex: LyraNumbericIndex = new Map();
  private booleanIndex: LyraBoolIndex = new Map();
  private enableStemming = true;

  private queue: queueAsPromised<QueueDocParams<TSchema>> = fastq.promise(
    this,
    this._insert,
    1
  );

  constructor(properties: LyraProperties<TSchema>) {
    const defaultLanguage =
      (properties?.defaultLanguage?.toLowerCase() as Language) ?? "english";

    if (!SUPPORTED_LANGUAGES.includes(defaultLanguage)) {
      throw ERRORS.LANGUAGE_NOT_SUPPORTED(defaultLanguage);
    }

    this.enableStemming = properties?.stemming ?? true;
    this.defaultLanguage = defaultLanguage;
    this.schema = properties.schema;
    this.buildIndex(properties.schema);
  }

  private buildIndex(schema: TSchema, prefix = "") {
    for (const prop of Object.keys(schema)) {
      const propType = typeof prop;
      const propValue = schema[prop];
      const isNested = typeof schema[prop] === "object";

      if (propType !== "string") throw ERRORS.INVALID_SCHEMA_TYPE(propType);

      const propName = `${prefix}${prop}`;

      if (isNested) {
        this.buildIndex(schema[prop] as TSchema, `${propName}.`);
      } else if (propValue === "string") {
        this.index.set(propName, new Trie());
      } else if (propValue === "boolean") {
        this.booleanIndex.set(`${propName}_true`, new Set());
        this.booleanIndex.set(`${propName}_false`, new Set());
      } else if (propValue === "number") {
        this.numericIndex.set(propName, new SortedQueue());
      }
    }
  }

  async search(
    params: SearchParams<TSchema>,
    language: Language = this.defaultLanguage
  ): SearchResult<TSchema> {
    const tokens = tokenize(params.term, language).values();
    const indices = this.getIndices(params.properties);
    const { boolIndices, numericIndices } = this.getNonSearchableIndices(
      params.where,
      this.schema
    );
    const documentAdded: Set<string> = new Set();

    const { limit = 10, offset = 0, exact = false, where } = params;
    const results: RetrievedDoc<TSchema>[] = Array.from({
      length: limit,
    });
    let count = 0;

    const timeStart = getNanosecondsTime();

    let i = 0;
    let j = 0;

    const documentIdsFromNonSearchable = this.getDocumentIDsFromWhere({
      boolIndices,
      numericIndices,
    });

    for (const term of tokens) {
      for (const index of indices) {
        const documentIDsFromText = await this.getDocumentIDsFromSearch({
          ...params,
          index: index,
          term: term,
          exact: exact,
          where: where,
        });

        // To avoid duplicates we need a subtraction between added document
        // And retrieved ones.
        // We check if this is the first
        // We use non-null assertion because setIntersection will return null only if both set are null
        // We are sure that documentsIDs is not null, so we are safew
        const documentIDs = setIntersection(
          documentIDsFromText,
          documentIdsFromNonSearchable
        )!;

        setSubtraction(documentIDs, documentAdded);
        if (documentIDs.size === 0) continue;

        count += documentIDs.size;

        if (i >= limit) {
          break;
        }

        for (const id of documentIDs) {
          if (j < offset) {
            j++;
            continue;
          }

          if (i >= limit) {
            break;
          }

          const fullDoc = this.docs.get(id)!;
          documentAdded.add(id);
          results[i] = { id, ...fullDoc };
          i++;
        }
      }
    }

    const hits = results.filter(Boolean);

    return {
      elapsed: formatNanoseconds(getNanosecondsTime() - timeStart),
      hits,
      count,
    };
  }

  private getIndices(indices: SearchParams<TSchema>["properties"]): string[] {
    const knownIndices = [...this.index.keys()];

    if (!indices) {
      return knownIndices;
    }

    if (typeof indices === "string") {
      if (indices === "*") {
        return knownIndices;
      } else {
        throw ERRORS.INVALID_PROPERTY(indices, knownIndices);
      }
    }

    for (const index of indices as string[]) {
      if (!knownIndices.includes(index)) {
        throw ERRORS.INVALID_PROPERTY(index, knownIndices);
      }
    }

    return indices as string[];
  }

  private getNonSearchableIndices(
    where: SearchParams<TSchema>["where"],
    schema: TSchema,
    prefix = ""
  ): GetDocumentFromWhereParams {
    const boolIndices: string[] = [];
    const numericIndices: string[] = [];
    if (!where) return { boolIndices, numericIndices };

    for (const key of Object.keys(where)) {
      const propName = `${prefix}${String(key)}`;
      const propValue = (where as any)[key];
      if (schema[key] === "boolean") handleBoolean(propValue, propName);
      else if (schema[key] === "number") handleNumeric(propValue, propName);
      else if (typeof schema[key] === "object") {
        const result = this.getNonSearchableIndices(
          propValue,
          schema[key] as TSchema,
          `${propName}.`
        );
        boolIndices.push(...result.boolIndices);
        numericIndices.push(...result.numericIndices);
      }
    }

    function handleBoolean(propValue: boolean, propName: string) {
      if (typeof propValue !== "boolean")
        throw ERRORS.INVALID_QUERY_PARAMS(propValue, ["true", "false"]);
      boolIndices.push(`${propName}_${propValue}`);
    }

    function handleNumeric(propValue: NumberComparison, propName: string) {
      const numericKeys = Object.keys(propValue);

      // By now we just support only one operator
      if (numericKeys.length > 1)
        throw ERRORS.INVALID_QUERY_PARAMS(JSON.stringify(propValue), [
          ...allowedNumericComparison,
        ]);

      const key = numericKeys[0] as keyof NumberComparison;
      if (!allowedNumericComparison.includes(key))
        throw ERRORS.INVALID_QUERY_PARAMS(key, [...allowedNumericComparison]);
      if (typeof propValue[key] !== "number")
        throw ERRORS.INVALID_QUERY_PARAMS(String(propValue[key]), ["a number"]);
      // Checks over, we can finally push the index
      // EX: publish.year.>=.1390
      // Later we will split and the last 2 element will be removed
      // Index obtained: publish.year
      // We will use last 2 element to build the predicate
      numericIndices.push(`${propName}.${key}.${propValue[key]}`);
    }

    return { boolIndices, numericIndices };
  }

  async delete(docID: string): Promise<boolean> {
    if (!this.docs.has(docID)) {
      throw ERRORS.DOC_ID_DOES_NOT_EXISTS(docID);
    }
    const textIndex = this.index;
    const numericIndex = this.numericIndex;
    const booleanIndex = this.booleanIndex;
    const document = this.docs.get(docID)!;

    removeDocFromIndexes(document);

    function removeDocFromIndexes(
      document: ResolveSchema<TSchema>,
      prefix = ""
    ) {
      for (const key of Object.keys(document)) {
        const propName = `${prefix}${key}`;
        const propValue = document[key];

        const idx = textIndex.get(propName)!;

        if (typeof propValue === "string") {
          const tokens = tokenize(propValue);

          for (const token of tokens) {
            if (idx.removeDocByWord(token, docID)) {
              throw `Unable to remove document "${docID}" from index "${key}" on word "${token}".`;
            }
          }
        } else if (typeof propValue === "number") {
          const idxs = numericIndex.get(propName);
          if (!idxs) continue;
          const nodeIndex = binarySearch(
            idxs?.queue,
            (current) => current.priority - propValue
          );
          if (nodeIndex === -1) continue;
          idxs.queue[nodeIndex].payload.delete(docID);
        } else if (typeof propValue === "boolean") {
          booleanIndex.delete(`${propName}_${propValue}`);
        } else if (typeof propValue === "object") {
          removeDocFromIndexes(
            propValue as ResolveSchema<TSchema>,
            `${propName}.`
          );
        }
      }
    }

    this.docs.delete(docID);

    return true;
  }

  private async getDocumentIDsFromSearch(
    params: SearchIDSParams<TSchema>
  ): Promise<Set<string>> {
    const idx = this.index.get(params.index);
    const searchResult = idx?.find({
      term: params.term,
      exact: params.exact,
      tolerance: params.tolerance,
    });
    const ids = new Set<string>();

    for (const key in searchResult) {
      for (const id of (searchResult as any)[key]) {
        ids.add(id);
      }
    }

    return ids;
  }

  public async insert(
    doc: ResolveSchema<TSchema>,
    config: InsertConfig = {
      language: this.defaultLanguage,
      stemming: this.enableStemming,
    }
  ): Promise<{ id: string }> {
    const id = nanoid();
    const language = config.language ?? this.defaultLanguage;

    if (!SUPPORTED_LANGUAGES.includes(language)) {
      throw ERRORS.LANGUAGE_NOT_SUPPORTED(language);
    }

    if (!(await this.checkInsertDocSchema(doc))) {
      throw ERRORS.INVALID_DOC_SCHEMA(this.schema, doc);
    }

    await this.queue.push({
      id,
      doc,
      config,
    });

    return { id };
  }

  private async _insert({
    doc,
    id,
    config,
  }: QueueDocParams<TSchema>): Promise<void> {
    const index = this.index;
    const boolIndex = this.booleanIndex;
    const numericIndex = this.numericIndex;

    this.docs.set(id, doc);

    function recursiveTrieInsertion(doc: ResolveSchema<TSchema>, prefix = "") {
      for (const key of Object.keys(doc)) {
        const isNested = typeof doc[key] === "object";
        const propName = `${prefix}${key}`;
        if (isNested) {
          recursiveTrieInsertion(
            doc[key] as ResolveSchema<TSchema>,
            `${propName}.`
          );
        } else if (typeof doc[key] === "string") {
          // Use propName here because if doc is a nested object
          // We will get the wrong index
          const requestedTrie = index.get(propName);
          const tokens = tokenize(
            doc[key] as string,
            config.language,
            config.stemming
          );

          for (const token of tokens) {
            requestedTrie?.insert(token, id);
          }
        } else if (typeof doc[key] === "boolean") {
          boolIndex.get(`${propName}_${doc[key]}`)?.add(id);
        } else if (typeof doc[key] === "number") {
          const numericKey = doc[key] as number;
          const numericQueue = numericIndex.get(propName);
          if (!numericQueue) return;

          const searchIndex = binarySearch(
            numericQueue.queue,
            (current) => current.priority - numericKey
          );

          if (searchIndex === -1) {
            const set = new Set<string>();
            set.add(id);
            numericQueue.enqueue(new QueueNode(numericKey, set));
          } else {
            numericQueue.queue[searchIndex].payload.add(id);
          }
        }
      }
    }

    recursiveTrieInsertion(doc);
  }

  private async checkInsertDocSchema(
    doc: QueueDocParams<TSchema>["doc"]
  ): Promise<boolean> {
    function recursiveCheck(
      newDoc: QueueDocParams<TSchema>["doc"],
      schema: PropertiesSchema
    ): boolean {
      for (const key in newDoc) {
        if (!(key in schema)) {
          return false;
        }

        const propType = typeof (newDoc as any)[key];

        if (propType === "object") {
          recursiveCheck((newDoc as any)[key], schema);
        } else {
          if (typeof (newDoc as any)[key] !== schema[key]) {
            return false;
          }
        }
      }

      return true;
    }

    return recursiveCheck(doc, this.schema);
  }

  private getDocumentIDsFromWhere({
    boolIndices,
    numericIndices,
  }: GetDocumentFromWhereParams): Nullable<Set<string>> {
    const booleanIds = new Set<string>();
    const numericIds = new Set<string>();
    for (const boolIndex of boolIndices) {
      if (!this.booleanIndex.has(boolIndex)) continue;
      for (const id of this.booleanIndex.get(boolIndex)!) {
        booleanIds.add(id);
      }
    }

    for (const virtualNumericIndex of numericIndices) {
      // We need to strip the operator and the value from the index before searching it
      // virtualNumericIndex string ->
      // prop1.prop2.prop3.prop3....propN.>=.14590
      const rawIndex = virtualNumericIndex.split(".");
      const numericIndex = rawIndex.slice(0, -2).join(".");
      const operator = rawIndex.at(-2) as keyof NumberComparison;
      const valueSearched = Number(rawIndex.at(-1));

      if (!this.numericIndex.has(numericIndex)) continue;

      const current = this.numericIndex.get(numericIndex)!;

      const nodeIndex = binarySearch(
        current.queue,
        (element) => element.priority - valueSearched
      );
      if (nodeIndex === -1) continue;

      const node = current.queue[nodeIndex];
      if (operator === "=") {
        node.payload.forEach((value) => numericIds.add(value));
      } else {
        const predicate = this.createPredicateForNumericComparison<
          QueueNode<Set<string>>
        >(operator, nodeIndex);

        const predicateResult = predicate(current.queue);

        for (const result of predicateResult) {
          result.payload.forEach((value) => numericIds.add(value));
        }
      }
    }

    const needNumberIntersect = numericIndices.length > 0;
    const needBooleanIntersect = boolIndices.length > 0;

    return setIntersection(
      needBooleanIntersect ? booleanIds : null,
      needNumberIntersect ? numericIds : null
    );
  }

  private createPredicateForNumericComparison<TArray>(
    operator: keyof NumberComparison,
    index: number
  ) {
    switch (operator) {
      case "<":
        return (array: TArray[]) => array.slice(0, index);
      case "<=":
        return (array: TArray[]) => array.slice(0, index + 1);
      case ">":
        return (array: TArray[]) => array.slice(index + 1);
      case ">=":
        return (array: TArray[]) => array.slice(index);
      default:
        return (array: TArray[]) => array;
    }
  }
}
