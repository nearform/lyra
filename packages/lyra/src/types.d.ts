import type { PropertiesSchema, allowedNumericComparison } from "./lyra";
export type Nullable<T> = T | null;

type ResolveTypes<TType> = TType extends "string"
  ? string
  : TType extends "boolean"
  ? boolean
  : TType extends "number"
  ? number
  : TType extends PropertiesSchema
  ? { [P in keyof TType]: ResolveTypes<TType[P]> }
  : never;

export type ResolveSchema<T extends PropertiesSchema> = {
  [P in keyof T]: ResolveTypes<T[P]>;
};

export type SearchProperties<
  TSchema extends PropertiesSchema,
  TKey extends keyof TSchema = keyof TSchema
> = TKey extends string
  ? TSchema[TKey] extends PropertiesSchema
    ? `${TKey}.${SearchProperties<TSchema[TKey]>}`
    : TKey
  : never;

// If TSchema[Tkey] is a string, we do not include it
// If it is a nested schema, we call WhereParams with TSchema[TKey]
// If it is a standard type we handle it
export type WhereParams<TSchema extends PropertiesSchema> = {
  [TKey in keyof TSchema as TSchema[TKey] extends "string"
    ? never
    : TKey]?: TSchema[TKey] extends PropertiesSchema
    ? WhereParams<TSchema[TKey]> extends [never] // If the nested WhereParams is empty we exclude it
      ? never
      : WhereParams<TSchema[TKey]>
    : TSchema[TKey] extends "number"
    ? NumberComparison
    : TSchema[TKey] extends "boolean"
    ? boolean
    : never;
};

export type NumberComparison = {
  [P in SupportedComparisons]?: number;
};

export type SupportedComparisons = typeof allowedNumericComparison[number];
