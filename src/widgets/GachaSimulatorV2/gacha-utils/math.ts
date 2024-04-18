/**
 * Returns a randomly selected item from an array of items based on their weights.
 * @template T - The type of items in the array.
 * @param {T[]} items - The array of items to choose from.
 * @param {number[]} weights - The corresponding weights for each item.
 * @returns {{ item: T; index: number }} - An object containing the selected item and its index.
 * @throws {Error} - If the lengths of items and weights are not the same, or if either of them is empty.
 */
export function weightedRandom<T>(
  items: T[],
  weights: number[],
): { item: T; index: number } {
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

  throw new Error("unreachable");
}
