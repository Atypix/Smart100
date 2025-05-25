/**
 * Creates sequences and corresponding targets from a list of prices.
 *
 * @param prices - Array of numbers (e.g., closing prices).
 * @param lookback - Number of past prices to include in each sequence.
 * @param horizon - Number of steps ahead to predict the target.
 * @returns An object containing arrays of sequences and targets.
 */
export function createPriceSequences(
  prices: number[],
  lookback: number,
  horizon: number
): { sequences: number[][]; targets: number[] } {
  const sequences: number[][] = [];
  const targets: number[] = [];

  if (lookback <= 0 || horizon <= 0) {
    // console.warn('Lookback and horizon must be positive.');
    return { sequences, targets };
  }

  // Total length needed for one sequence-target pair: lookback + horizon
  // Last possible starting point for a sequence's *first* element is prices.length - (lookback + horizon)
  // The sequence itself ends at index i. The target is at i + horizon.
  // So, i + horizon must be < prices.length.
  // The sequence starts at i - lookback + 1. This must be >= 0.
  // So, i >= lookback - 1.
  // And i must be such that prices[i+horizon] is a valid index.
  // So, i_max = prices.length - 1 - horizon.

  for (let i = lookback - 1; i < prices.length - horizon; i++) {
    const currentPrice = prices[i];
    const targetPrice = prices[i + horizon];

    if (targetPrice === undefined || currentPrice === undefined) {
      // Should not happen if loop condition is correct, but as a safeguard
      continue;
    }

    const sequence = prices.slice(i - lookback + 1, i + 1);
    sequences.push(sequence);

    targets.push(targetPrice > currentPrice ? 1 : 0);
  }

  return { sequences, targets };
}

/**
 * Normalizes price sequences using Min-Max scaling.
 *
 * @param sequences - Array of price sequences.
 * @param existingMinMax - Optional existing min and max values to use for normalization.
 * @returns An object containing the normalized sequences and the min/max values used.
 */
export function normalizeData(
  sequences: number[][],
  existingMinMax?: { min: number; max: number }
): { normalizedSequences: number[][]; minMax: { min: number; max: number } } {
  if (sequences.length === 0 || sequences[0].length === 0) {
    const minMaxVal = existingMinMax || { min: 0, max: 0 }; // Or handle as error/specific case
    return { normalizedSequences: [], minMax: minMaxVal };
  }

  let min: number;
  let max: number;

  if (existingMinMax) {
    min = existingMinMax.min;
    max = existingMinMax.max;
  } else {
    min = Infinity;
    max = -Infinity;
    for (const sequence of sequences) {
      for (const value of sequence) {
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
  }
  
  // Handle case where all values in sequences are the same (or if only one value exists when calculating new min/max)
  if (min === max) {
    const normalizedSequences = sequences.map(sequence =>
      sequence.map(() => 0.5) // Or 0, depends on convention for this edge case
    );
    return { normalizedSequences, minMax: { min, max } };
  }

  const normalizedSequences = sequences.map(sequence =>
    sequence.map(value => (value - min) / (max - min))
  );

  return { normalizedSequences, minMax: { min, max } };
}
