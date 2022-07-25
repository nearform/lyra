import { SUPPORTED_LANGUAGES } from "./stemmer";

function formatJSON(input: object) {
  return JSON.stringify(input, null, 2);
}

export const INVALID_SCHEMA_TYPE = (type: string) =>
  `Invalid schema type. Expected string or object, but got ${type}`;
export const INVALID_DOC_SCHEMA = (expected: object, found: object) =>
  `Invalid document structure. \nClass has been initialized with the following schema: \n\n${formatJSON(
    expected
  )}\n\nbut found the following doc:\n\n${formatJSON(found)}`;

export const INVALID_PROPERTY = (name: string, expected: string[]) =>
  `Invalid property name. Expected a wildcard string ("*") or array containing one of the following properties: ${expected.join(
    ", "
  )}, but got: ${name}`;

export const CANT_DELETE_DOC_NOT_FOUND = (id: string) =>
  `Document with ID ${id} does not exist.`;

export const UNSUPPORTED_NESTED_PROPERTIES = () =>
  `Nested properties are not supported in this Lyra version, but will be in the future.`;

export const DOC_ID_DOES_NOT_EXISTS = (id: string) =>
  `Document with ID ${id} does not exists`;

export const LANGUAGE_NOT_SUPPORTED = (lang: string) =>
  `Language "${lang}" is not supported.\nSupported languages are:\n - ${SUPPORTED_LANGUAGES.join(
    "\n - "
  )}`;

export const INVALID_QUERY_PARAMS = (got: string, expected: string[]) =>
  `Invalid query parameters. Expected ${expected.join(", ")}, but got: ${got}`;
