const previousPatterns = new Map<string, string>();

function signature<T>(items: readonly T[], getKey: (item: T) => string) {
  return JSON.stringify(items.map(getKey));
}

function shuffle<T>(items: readonly T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

export function shuffleDifferentFromLast<T>(
  sequenceId: string,
  items: readonly T[],
  getKey: (item: T) => string
) {
  const next = shuffle(items);
  const previous = previousPatterns.get(sequenceId);
  if (next.length > 1 && signature(next, getKey) === previous) {
    for (let offset = 1; offset < next.length; offset += 1) {
      const candidate = [...next.slice(offset), ...next.slice(0, offset)];
      if (signature(candidate, getKey) !== previous) {
        previousPatterns.set(sequenceId, signature(candidate, getKey));
        return candidate;
      }
    }
  }
  previousPatterns.set(sequenceId, signature(next, getKey));
  return next;
}

export function randomSequenceDifferentFromLast<T>(
  sequenceId: string,
  items: readonly T[],
  count: number,
  getKey: (item: T) => string
) {
  if (!items.length || count <= 0) return [];

  const next = Array.from(
    { length: count },
    () => items[Math.floor(Math.random() * items.length)]
  );
  const previous = previousPatterns.get(sequenceId);
  if (items.length > 1 && signature(next, getKey) === previous) {
    const lastIndex = next.length - 1;
    const alternatives = items.filter((item) => getKey(item) !== getKey(next[lastIndex]));
    if (alternatives.length) {
      next[lastIndex] = alternatives[Math.floor(Math.random() * alternatives.length)];
    }
  }
  previousPatterns.set(sequenceId, signature(next, getKey));
  return next;
}
