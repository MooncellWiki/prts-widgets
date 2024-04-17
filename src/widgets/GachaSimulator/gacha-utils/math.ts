export function weightedRandom<T>(
  items: T[],
  weights: number[],
): { item: T | null; index: number } {
  if (items.length !== weights.length)
    throw new Error("Items and weights must be of the same size");
  if (items.length === 0 || weights.length === 0)
    throw new Error("Items or Weights must not be empty");
  if (weights.length !== items.length)
    throw new Error("Each item should have a weight");

  const cumulativeWeights: Array<number> = [];
  for (const [i, weight] of weights.entries()) {
    cumulativeWeights[i] = weight + (cumulativeWeights[i - 1] || 0);
  }
  const maxCumulativeWeight = cumulativeWeights.at(-1);
  if (!maxCumulativeWeight) {
    throw new Error("Got falsy maxCumulativeWeight");
  }

  const randomNumber = maxCumulativeWeight * Math.random();
  for (const [itemIndex, item] of items.entries()) {
    if (cumulativeWeights[itemIndex] >= randomNumber) {
      return {
        item: item,
        index: itemIndex,
      };
    }
  }

  return { item: null, index: -1 };
}
