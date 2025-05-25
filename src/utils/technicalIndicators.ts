/**
 * Calculates the Simple Moving Average (SMA) for a given set of prices and period.
 * @param prices - An array of numbers representing the prices.
 * @param period - The period over which to calculate the SMA.
 * @returns An array of SMA values, padded with NaN at the beginning.
 */
export function calculateSMA(prices: number[], period: number): number[] {
  if (period <= 0 || prices.length === 0) {
    return Array(prices.length).fill(NaN);
  }

  const smaValues: number[] = Array(prices.length).fill(NaN);

  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += prices[i - j];
    }
    smaValues[i] = sum / period;
  }

  return smaValues;
}

/**
 * Calculates the standard deviation for a given set of numbers.
 * @param numbers - An array of numbers.
 * @param period - The period over which to calculate the standard deviation.
 * @returns The standard deviation.
 */
function calculateStandardDeviation(prices: number[], period: number, startIndex: number): number {
  if (period <= 0 || prices.length < period || startIndex < period -1) {
    return NaN;
  }
  const slice = prices.slice(startIndex - period + 1, startIndex + 1);
  const mean = slice.reduce((acc, val) => acc + val, 0) / period;
  const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
  return Math.sqrt(variance);
}

/**
 * Calculates the Bollinger Bands for a given set of prices, period, and standard deviation multiplier.
 * @param prices - An array of numbers representing the prices.
 * @param period - The period over which to calculate the Bollinger Bands.
 * @param stdDevMultiplier - The number of standard deviations for the upper and lower bands.
 * @returns An object containing arrays for the middle, upper, and lower bands.
 */
export function calculateBollingerBands(
  prices: number[],
  period: number,
  stdDevMultiplier: number
): { middle: number[]; upper: number[]; lower: number[] } {
  if (period <= 0 || prices.length === 0) {
    return {
      middle: Array(prices.length).fill(NaN),
      upper: Array(prices.length).fill(NaN),
      lower: Array(prices.length).fill(NaN),
    };
  }

  const middleBand = calculateSMA(prices, period);
  const upperBand: number[] = Array(prices.length).fill(NaN);
  const lowerBand: number[] = Array(prices.length).fill(NaN);

  for (let i = period - 1; i < prices.length; i++) {
    if (isNaN(middleBand[i])) {
      continue;
    }
    const stdDev = calculateStandardDeviation(prices, period, i);
    if (isNaN(stdDev)) {
      upperBand[i] = NaN;
      lowerBand[i] = NaN;
    } else {
      upperBand[i] = middleBand[i] + stdDev * stdDevMultiplier;
      lowerBand[i] = middleBand[i] - stdDev * stdDevMultiplier;
    }
  }

  return { middle: middleBand, upper: upperBand, lower: lowerBand };
}

/**
 * Calculates the Relative Strength Index (RSI) for a given set of prices and period.
 * @param prices - An array of numbers representing the prices.
 * @param period - The period over which to calculate the RSI.
 * @returns An array of RSI values, padded with NaN at the beginning.
 */
export function calculateRSI(prices: number[], period: number): number[] {
  if (period <= 0 || prices.length < period) {
    return Array(prices.length).fill(NaN);
  }

  const rsiValues: number[] = Array(prices.length).fill(NaN);
  const priceChanges: number[] = prices.slice(1).map((price, i) => price - prices[i]);

  let avgGain = 0;
  let avgLoss = 0;

  // Calculate initial average gain and loss
  for (let i = 0; i < period; i++) {
    const change = priceChanges[i];
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) {
    rsiValues[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    rsiValues[period] = 100 - 100 / (1 + rs);
  }
  

  // Calculate subsequent RSI values using smoothed average
  for (let i = period; i < priceChanges.length; i++) {
    const currentChange = priceChanges[i];
    let currentGain = 0;
    let currentLoss = 0;

    if (currentChange > 0) {
      currentGain = currentChange;
    } else {
      currentLoss = Math.abs(currentChange);
    }

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    if (avgLoss === 0) {
      rsiValues[i + 1] = 100; // If avgLoss is 0, RSI is 100 (or could be 0 if avgGain is also 0, typically 100)
    } else {
      const rs = avgGain / avgLoss;
      rsiValues[i + 1] = 100 - 100 / (1 + rs);
    }
  }

  return rsiValues;
}
