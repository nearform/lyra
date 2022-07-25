import { Nullable } from "./types";

export const isServer = typeof window === "undefined";

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) {
    return "0 Bytes";
  }
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function formatNanoseconds(unit: bigint): string {
  const nano = 1_000_000n;
  const micro = 1000n;

  if (unit < nano) {
    return `${unit / micro}μs`;
  }

  return `${unit / nano}ms`;
}

export function getNanosecondsTime(): bigint {
  if (isServer) {
    return process.hrtime.bigint();
  }

  return BigInt(Math.floor(performance.now()) * 1000);
}

export function setIntersection<T = unknown>(
  a: Nullable<Set<T>>,
  b: Nullable<Set<T>>
): Nullable<Set<T>> {
  if (!a) return b;
  if (!b) return a;

  const smallerSet = a.size > b.size ? b : a;
  const biggerSet = a.size > b.size ? a : b;
  const insersection = new Set<T>();
  for (const element of smallerSet) {
    if (biggerSet.has(element)) insersection.add(element);
  }
  return insersection;
}

export function setSubtraction<T = unknown>(
  from: Set<T> = new Set<T>(),
  toRemove: Set<T> = new Set<T>()
): void {
  for (const element of toRemove) {
    from.delete(element);
  }
}

type ComparePredicate<TArrayElement> = (current: TArrayElement) => number;

// Assume the array is sorted
export function binarySearch<TArrayElement>(
  array: TArrayElement[],
  comparePredicate: ComparePredicate<TArrayElement>
): number {
  if (array.length === 0) return -1;

  let start = 0;
  let end = array.length - 1;

  while (start <= end) {
    const mIndex = Math.floor((start + end) / 2);
    const compareResult = comparePredicate(array[mIndex]);
    if (compareResult === 0) return mIndex;
    else if (compareResult < 0) start = mIndex + 1;
    else end = mIndex - 1;
  }

  return -1;
}
