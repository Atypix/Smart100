// In src/strategies/implementations/ichimokuStrategy.ts
import { HistoricalDataPoint } from '../../services/dataService';
import { TradingStrategy, StrategyContext, StrategySignal, StrategyParameterDefinition } from '../strategy.types';
import logger from '../../utils/logger'; // Changed to default import

// --- Helper Functions for Ichimoku Calculations ---

function getHighestHigh(data: HistoricalDataPoint[], period: number, endIndex: number): number | null {
  if (endIndex < period - 1 || period <= 0) return null;
  const startIndex = endIndex - period + 1;
  let highest = -Infinity;
  for (let i = startIndex; i <= endIndex; i++) {
    if (i < 0 || i >= data.length) return null; // Not enough data for the start of the period
    highest = Math.max(highest, data[i].high);
  }
  return highest === -Infinity ? null : highest;
}

function getLowestLow(data: HistoricalDataPoint[], period: number, endIndex: number): number | null {
  if (endIndex < period - 1 || period <= 0) return null;
  const startIndex = endIndex - period + 1;
  let lowest = Infinity;
  for (let i = startIndex; i <= endIndex; i++) {
    if (i < 0 || i >= data.length) return null; // Not enough data for the start of the period
    lowest = Math.min(lowest, data[i].low);
  }
  return lowest === Infinity ? null : lowest;
}

interface IchimokuValues {
  tenkanSen: number | null;
  kijunSen: number | null;
  senkouSpanA: number | null; // Value for the current period (projected from the past)
  senkouSpanB: number | null; // Value for the current period (projected from the past)
  chikouSpan: number | null;  // Value of close price, `chikouLaggingPeriod` ago
  
  // Values for the future cloud, used for outlook
  futureSenkouSpanA: number | null;
  futureSenkouSpanB: number | null;
}

function calculateIchimokuComponents(
  historicalData: HistoricalDataPoint[],
  currentIndex: number,
  tenkanPeriod: number,
  kijunPeriod: number,
  senkouSpanBPeriod: number,
  chikouLaggingPeriod: number,
  senkouCloudDisplacement: number 
): IchimokuValues {
  const values: Partial<IchimokuValues> = {};

  // Tenkan-sen (Conversion Line)
  const tenkanHigh = getHighestHigh(historicalData, tenkanPeriod, currentIndex);
  const tenkanLow = getLowestLow(historicalData, tenkanPeriod, currentIndex);
  if (tenkanHigh !== null && tenkanLow !== null) {
    values.tenkanSen = (tenkanHigh + tenkanLow) / 2;
  } else {
    values.tenkanSen = null;
  }

  // Kijun-sen (Base Line)
  const kijunHigh = getHighestHigh(historicalData, kijunPeriod, currentIndex);
  const kijunLow = getLowestLow(historicalData, kijunPeriod, currentIndex);
  if (kijunHigh !== null && kijunLow !== null) {
    values.kijunSen = (kijunHigh + kijunLow) / 2;
  } else {
    values.kijunSen = null;
  }

  // Chikou Span (Lagging Span) - This is the close price `chikouLaggingPeriod` ago
  if (currentIndex >= chikouLaggingPeriod) {
    values.chikouSpan = historicalData[currentIndex - chikouLaggingPeriod].close;
  } else {
    values.chikouSpan = null;
  }

  // Senkou Span A & B for the *current* Kumo cloud (plotted at `currentIndex`)
  // These were calculated `senkouCloudDisplacement` periods ago.
  const pastIndexForCurrentCloud = currentIndex - senkouCloudDisplacement;
  if (pastIndexForCurrentCloud >= 0) {
    const pastTenkanHigh = getHighestHigh(historicalData, tenkanPeriod, pastIndexForCurrentCloud);
    const pastTenkanLow = getLowestLow(historicalData, tenkanPeriod, pastIndexForCurrentCloud);
    let pastTenkanSen: number | null = null;
    if (pastTenkanHigh !== null && pastTenkanLow !== null) {
      pastTenkanSen = (pastTenkanHigh + pastTenkanLow) / 2;
    }

    const pastKijunHigh = getHighestHigh(historicalData, kijunPeriod, pastIndexForCurrentCloud);
    const pastKijunLow = getLowestLow(historicalData, kijunPeriod, pastIndexForCurrentCloud);
    let pastKijunSen: number | null = null;
    if (pastKijunHigh !== null && pastKijunLow !== null) {
      pastKijunSen = (pastKijunHigh + pastKijunLow) / 2;
    }

    if (pastTenkanSen !== null && pastKijunSen !== null) {
      values.senkouSpanA = (pastTenkanSen + pastKijunSen) / 2;
    } else {
      values.senkouSpanA = null;
    }

    const pastSenkouBHigh = getHighestHigh(historicalData, senkouSpanBPeriod, pastIndexForCurrentCloud);
    const pastSenkouBLow = getLowestLow(historicalData, senkouSpanBPeriod, pastIndexForCurrentCloud);
    if (pastSenkouBHigh !== null && pastSenkouBLow !== null) {
      values.senkouSpanB = (pastSenkouBHigh + pastSenkouBLow) / 2;
    } else {
      values.senkouSpanB = null;
    }
  } else {
    values.senkouSpanA = null;
    values.senkouSpanB = null;
  }
  
  // Senkou Span A & B for the *future* Kumo cloud (plotted `senkouCloudDisplacement` periods ahead of `currentIndex`)
  // These are calculated based on current Tenkan-sen and Kijun-sen.
  if (values.tenkanSen !== null && values.kijunSen !== null) {
      values.futureSenkouSpanA = (values.tenkanSen + values.kijunSen) / 2;
  } else {
      values.futureSenkouSpanA = null;
  }

  const futureSenkouBHigh = getHighestHigh(historicalData, senkouSpanBPeriod, currentIndex);
  const futureSenkouBLow = getLowestLow(historicalData, senkouSpanBPeriod, currentIndex);
  if (futureSenkouBHigh !== null && futureSenkouBLow !== null) {
      values.futureSenkouSpanB = (futureSenkouBHigh + futureSenkouBLow) / 2;
  } else {
      values.futureSenkouSpanB = null;
  }

  return values as IchimokuValues;
}


// --- Ichimoku Cloud Strategy Definition ---

const ichimokuStrategyParameters: StrategyParameterDefinition[] = [
  { name: 'tenkanPeriod', label: 'Tenkan-sen Period', type: 'number', defaultValue: 9 },
  { name: 'kijunPeriod', label: 'Kijun-sen Period', type: 'number', defaultValue: 26 },
  { name: 'senkouSpanBPeriod', label: 'Senkou Span B Period', type: 'number', defaultValue: 52 },
  { name: 'chikouLaggingPeriod', label: 'Chikou Span Lag Period', type: 'number', defaultValue: 26 },
  { name: 'senkouCloudDisplacement', label: 'Cloud Displacement', type: 'number', defaultValue: 26 },
  { name: 'tradeAmount', label: 'Trade Amount', type: 'number', defaultValue: 1, description: 'Number of shares to trade or units of asset.'}
];

export const ichimokuCloudStrategy: TradingStrategy = {
  id: 'ichimoku-cloud',
  name: 'Ichimoku Cloud Strategy',
  description: 'A trend-following strategy based on the Ichimoku Kinko Hyo indicator. It uses multiple lines (Tenkan-sen, Kijun-sen), a projected cloud (Kumo), and a lagging span (Chikou) to identify trends and generate signals.',
  parameters: ichimokuStrategyParameters,

  async execute(context: StrategyContext): Promise<StrategySignal[]> { // Changed signature
    const { historicalData, currentIndex, portfolio, parameters } = context;
    const { 
      tenkanPeriod, 
      kijunPeriod, 
      senkouSpanBPeriod, 
      chikouLaggingPeriod, 
      senkouCloudDisplacement,
      tradeAmount
    } = parameters as { 
      tenkanPeriod: number; 
      kijunPeriod: number; 
      senkouSpanBPeriod: number; 
      chikouLaggingPeriod: number; 
      senkouCloudDisplacement: number;
      tradeAmount: number;
    };

    // Ensure enough data for the longest period + displacement for Chikou comparison
    const minDataLength = Math.max(tenkanPeriod, kijunPeriod, senkouSpanBPeriod) + chikouLaggingPeriod + senkouCloudDisplacement;
    if (currentIndex < minDataLength) {
      // logger.debug(`Ichimoku: Not enough data at index ${currentIndex}. Need ${minDataLength} points.`);
      return Promise.resolve([{ action: 'HOLD', amount: 0 }]); // Wrapped return
    }

    const ichimoku = calculateIchimokuComponents(
      historicalData,
      currentIndex,
      tenkanPeriod,
      kijunPeriod,
      senkouSpanBPeriod,
      chikouLaggingPeriod,
      senkouCloudDisplacement
    );

    const prevIchimoku = calculateIchimokuComponents( // For crossover detection
      historicalData,
      currentIndex - 1,
      tenkanPeriod,
      kijunPeriod,
      senkouSpanBPeriod,
      chikouLaggingPeriod,
      senkouCloudDisplacement
    );

    if (!ichimoku.tenkanSen || !ichimoku.kijunSen || !ichimoku.senkouSpanA || !ichimoku.senkouSpanB || !ichimoku.chikouSpan ||
        !prevIchimoku.tenkanSen || !prevIchimoku.kijunSen || !ichimoku.futureSenkouSpanA || !ichimoku.futureSenkouSpanB) {
      // logger.debug(`Ichimoku: Null indicator values at index ${currentIndex}. Holding.`);
      return Promise.resolve([{ action: 'HOLD', amount: 0 }]); // Wrapped return
    }

    const currentPrice = historicalData[currentIndex].close;
    const currentHigh = historicalData[currentIndex].high; // useful for more aggressive entries
    const currentLow = historicalData[currentIndex].low;   // useful for more aggressive entries

    // --- Bullish Conditions ---
    // 1. Tenkan-sen crosses above Kijun-sen (Golden Cross)
    const tenkanKijunBullishCross = prevIchimoku.tenkanSen < prevIchimoku.kijunSen && ichimoku.tenkanSen > ichimoku.kijunSen;

    // 2. Price is above the Kumo (Cloud)
    const priceAboveKumo = currentPrice > ichimoku.senkouSpanA && currentPrice > ichimoku.senkouSpanB;

    // 3. Chikou Span is above the price `chikouLaggingPeriod` ago 
    //    (comparing current Chikou value with price at the point where Chikou is plotted)
    //    The Chikou span value *is* historicalData[currentIndex - chikouLaggingPeriod].close
    //    The price it's compared against is historicalData[currentIndex - chikouLaggingPeriod - senkouCloudDisplacement].close
    //    This is complex: Chikou Span is close[currentIndex - lag]. Compare it to price[currentIndex - lag].
    //    The common interpretation is Chikou above price cloud of `chikouLaggingPeriod` ago.
    //    Let's use: Chikou Span (price from `currentIndex - lag`) is above price cloud `lag` periods ago.
    //    The price corresponding to Chikou's plot point is `historicalData[currentIndex - chikouLaggingPeriod].close`
    //    So, `ichimoku.chikouSpan` (which is close[currentIndex - chikouLaggingPeriod])
    //    should be compared against `historicalData[currentIndex - chikouLaggingPeriod].close` (which is itself)
    //    No, this is wrong. Chikou Span is `close[currentIndex - B]` (where B=chikouLaggingPeriod).
    //    It should be above the price at `currentIndex - B`.
    //    So, `historicalData[currentIndex - chikouLaggingPeriod].close > historicalData[currentIndex - chikouLaggingPeriod - chikouLaggingPeriod].close` ?
    //    This is not standard. Standard: `Chikou > Price Cloud (shifted)`
    //    A simpler way: current Chikou value (price from X periods ago) is above the price line from X periods ago.
    //    Chikou value is `historicalData[currentIndex - chikouLaggingPeriod].close`
    //    Price at that time was `historicalData[currentIndex - chikouLaggingPeriod].close` (this is tautological)
    //    The common check is `Chikou Span > Price line at the time of Chikou Span`
    //    Which means `close[currentIndex - lagPeriod]` vs `close[currentIndex - lagPeriod - displacement]` NO
    //    It is `close[currentIndex - chikouLaggingPeriod]` vs `KUMO[currentIndex - chikouLaggingPeriod]`
    //    Or simpler: `chikouSpan` (which is `close[currentIndex-lag]`) is above `price[currentIndex-lag]`
    //    This means `historicalData[currentIndex - chikouLaggingPeriod].close > historicalData[currentIndex - chikouLaggingPeriod].close` - still not right.
    //    The Chikou Span is a visual confirmation. `chikouSpan` value (price `N` bars ago) must be above the cloud `N` bars ago.
    //    For simplicity in this first pass, let's say `ichimoku.chikouSpan > historicalData[currentIndex - chikouLaggingPeriod].high` (a strong signal) - still not quite right.
    //    The standard Chikou signal: Chikou Span crosses price from bottom to top.
    //    `historicalData[currentIndex - chikouLaggingPeriod - 1].close < historicalData[currentIndex - chikouLaggingPeriod - 1 - chikouLaggingPeriod].close`
    //    AND `historicalData[currentIndex - chikouLaggingPeriod].close > historicalData[currentIndex - chikouLaggingPeriod - chikouLaggingPeriod].close` -- this is too complex for direct translation.
    //    Let's use: Chikou is above price `chikouLaggingPeriod` ago. This means `historicalData[currentIndex - chikouLaggingPeriod].close` must be greater than `historicalData[currentIndex - chikouLaggingPeriod*2].close`.
    //    No, the reference is `historicalData[currentIndex - chikouLaggingPeriod].close` (the Chikou value) must be above `historicalData[currentIndex - chikouLaggingPeriod].close` (the price at that time).
    //    This is simpler: is the Chikou span value (price from `chikouLaggingPeriod` ago) currently above the Kumo cloud that *existed at that time*?
    //    The Chikou span value is `historicalData[currentIndex - chikouLaggingPeriod].close`.
    //    The Kumo at `currentIndex - chikouLaggingPeriod` would require calculating Senkou A/B using data up to `currentIndex - chikouLaggingPeriod - senkouCloudDisplacement`.
    //    This is getting very complex. Simpler Chikou rule: `chikouSpan` (price from `N` periods ago) is above the Kumo cloud *at the current index `currentIndex`*.
    //    This is a common simplification: `ichimoku.chikouSpan > ichimoku.senkouSpanA && ichimoku.chikouSpan > ichimoku.senkouSpanB`.
    const chikouAboveCurrentKumo = ichimoku.chikouSpan > ichimoku.senkouSpanA && ichimoku.chikouSpan > ichimoku.senkouSpanB;


    // 4. Kumo ahead is bullish (Senkou Span A > Senkou Span B for the *future* cloud)
    const futureKumoBullish = ichimoku.futureSenkouSpanA > ichimoku.futureSenkouSpanB;

    if (tenkanKijunBullishCross && priceAboveKumo && chikouAboveCurrentKumo && futureKumoBullish) {
      if (portfolio.cash >= currentPrice * tradeAmount) {
        return Promise.resolve([{ action: 'BUY', amount: tradeAmount }]); // Wrapped return
      }
    }

    // --- Bearish Conditions ---
    // 1. Tenkan-sen crosses below Kijun-sen (Dead Cross)
    const tenkanKijunBearishCross = prevIchimoku.tenkanSen > prevIchimoku.kijunSen && ichimoku.tenkanSen < ichimoku.kijunSen;

    // 2. Price is below the Kumo
    const priceBelowKumo = currentPrice < ichimoku.senkouSpanA && currentPrice < ichimoku.senkouSpanB;
    
    // 3. Chikou Span is below the Kumo (current cloud)
    const chikouBelowCurrentKumo = ichimoku.chikouSpan < ichimoku.senkouSpanA && ichimoku.chikouSpan < ichimoku.senkouSpanB;

    // 4. Kumo ahead is bearish
    const futureKumoBearish = ichimoku.futureSenkouSpanA < ichimoku.futureSenkouSpanB;

    if (tenkanKijunBearishCross && priceBelowKumo && chikouBelowCurrentKumo && futureKumoBearish) {
      if (portfolio.shares >= tradeAmount) {
        return Promise.resolve([{ action: 'SELL', amount: tradeAmount }]); // Wrapped return
      }
    }

    return Promise.resolve([{ action: 'HOLD', amount: 0 }]); // Wrapped return
  },
};

// TODO: Consider adding getIndicators method to expose Ichimoku values for plotting.
// getIndicators: (context: StrategyContext) => {
//   const params = context.parameters as { tenkanPeriod: number; kijunPeriod: number; senkouSpanBPeriod: number; chikouLaggingPeriod: number; senkouCloudDisplacement: number};
//   return calculateIchimokuComponents(
//     context.historicalData, 
//     context.currentIndex, 
//     params.tenkanPeriod, 
//     params.kijunPeriod, 
//     params.senkouSpanBPeriod, 
//     params.chikouLaggingPeriod, 
//     params.senkouCloudDisplacement
//   );
// }
