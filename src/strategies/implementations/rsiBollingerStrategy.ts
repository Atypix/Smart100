import { TradingStrategy, StrategyContext, StrategySignal, StrategyParameterDefinition } from '../strategy.types';
import { calculateRSI, calculateBollingerBands } from '../../utils/technicalIndicators';
import { HistoricalDataPoint } from '../../services/dataService'; // Assuming OHLCV is part of HistoricalDataPoint or equivalent
import logger from '../../utils/logger'; // Changed to default import

const rsiBollingerStrategyParameters: StrategyParameterDefinition[] = [
  { 
    name: 'rsiPeriod', 
    label: 'RSI Period', 
    type: 'number', 
    defaultValue: 14,
    description: 'Period for RSI calculation.',
    min: 2,
    max: 100,
    step: 1,
  },
  { 
    name: 'rsiOverbought', 
    label: 'RSI Overbought Threshold', 
    type: 'number', 
    defaultValue: 70,
    description: 'RSI level above which an asset is considered overbought.',
    min: 50,
    max: 100,
    step: 1,
  },
  { 
    name: 'rsiOversold', 
    label: 'RSI Oversold Threshold', 
    type: 'number', 
    defaultValue: 30,
    description: 'RSI level below which an asset is considered oversold.',
    min: 0,
    max: 50,
    step: 1,
  },
  { 
    name: 'bollingerPeriod', 
    label: 'Bollinger Bands Period', 
    type: 'number', 
    defaultValue: 20,
    description: 'Period for Bollinger Bands SMA calculation.',
    min: 2,
    max: 100,
    step: 1,
  },
  { 
    name: 'bollingerStdDev', 
    label: 'Bollinger Bands StdDev Multiplier', 
    type: 'number', 
    defaultValue: 2,
    description: 'Number of standard deviations for upper/lower Bollinger Bands.',
    min: 0.5,
    max: 5,
    step: 0.1,
  },
  { 
    name: 'tradeAmount', 
    label: 'Trade Amount', 
    type: 'number', 
    defaultValue: 1,
    description: 'Number of shares/units to trade per signal.',
    min: 0.001, // Assuming fractional shares/units might be possible
    step: 0.001,
  }
];

export const rsiBollingerStrategy: TradingStrategy = {
  id: 'rsi-bollinger',
  name: 'RSI + Bollinger Bands Strategy',
  description: 'Generates BUY signals when RSI is oversold and price is at/below lower Bollinger Band. Generates SELL signals when RSI is overbought and price is at/above upper Bollinger Band.',
  parameters: rsiBollingerStrategyParameters,

  async execute(context: StrategyContext): Promise<StrategySignal[]> { // Changed signature
    const { historicalData, currentIndex, portfolio, parameters } = context;
    const {
      rsiPeriod,
      rsiOverbought,
      rsiOversold,
      bollingerPeriod,
      bollingerStdDev,
      tradeAmount
    } = parameters as {
      rsiPeriod: number;
      rsiOverbought: number;
      rsiOversold: number;
      bollingerPeriod: number;
      bollingerStdDev: number;
      tradeAmount: number;
    };

    // Ensure we have enough data for the longest period required by indicators
    // RSI needs rsiPeriod prices. Bollinger Bands need bollingerPeriod prices.
    // The indicator functions return NaN-padded arrays, so we check specific values later.
    const requiredDataLength = Math.max(rsiPeriod + 1, bollingerPeriod +1); // Need +1 for price changes in RSI
    if (currentIndex < requiredDataLength -1) { // -1 because currentIndex is 0-based
        // logger.debug(`[${rsiBollingerStrategy.id}] Not enough data at index ${currentIndex}. Need data for up to index ${requiredDataLength -1}. Holding.`);
        return Promise.resolve([{ action: 'HOLD' }]); // Wrapped return
    }
    
    const closingPrices = historicalData.map((d: HistoricalDataPoint) => d.close);

    const rsiValues = calculateRSI(closingPrices, rsiPeriod);
    const bollingerBands = calculateBollingerBands(closingPrices, bollingerPeriod, bollingerStdDev);

    const currentRSI = rsiValues[currentIndex];
    const currentPrice = historicalData[currentIndex].close;
    const currentBollingerUpper = bollingerBands.upper[currentIndex];
    const currentBollingerLower = bollingerBands.lower[currentIndex];
    // const currentBollingerMiddle = bollingerBands.middle[currentIndex]; // Not used in this logic but available

    if (
      isNaN(currentRSI) ||
      isNaN(currentPrice) || // Should not be NaN if historicalData[currentIndex] exists
      isNaN(currentBollingerUpper) ||
      isNaN(currentBollingerLower)
    ) {
      // logger.debug(`[${rsiBollingerStrategy.id}] Indicator values are NaN at index ${currentIndex}. RSI: ${currentRSI}, UpperBB: ${currentBollingerUpper}, LowerBB: ${currentBollingerLower}. Holding.`);
      return Promise.resolve([{ action: 'HOLD' }]); // Wrapped return
    }

    // BUY Signal
    if (currentRSI < rsiOversold && currentPrice <= currentBollingerLower) {
      if (portfolio.cash >= currentPrice * tradeAmount) {
        // logger.info(`[${rsiBollingerStrategy.id}] BUY signal at index ${currentIndex}: RSI (${currentRSI.toFixed(2)}) < ${rsiOversold} AND Price (${currentPrice.toFixed(2)}) <= Lower BB (${currentBollingerLower.toFixed(2)})`);
        return Promise.resolve([{ action: 'BUY', amount: tradeAmount }]); // Wrapped return
      } else {
        // logger.debug(`[${rsiBollingerStrategy.id}] BUY signal triggered but insufficient cash at index ${currentIndex}. Holding.`);
        return Promise.resolve([{ action: 'HOLD' }]); // Wrapped return
      }
    }

    // SELL Signal
    if (currentRSI > rsiOverbought && currentPrice >= currentBollingerUpper) {
      if (portfolio.shares >= tradeAmount) {
        // logger.info(`[${rsiBollingerStrategy.id}] SELL signal at index ${currentIndex}: RSI (${currentRSI.toFixed(2)}) > ${rsiOverbought} AND Price (${currentPrice.toFixed(2)}) >= Upper BB (${currentBollingerUpper.toFixed(2)})`);
        return Promise.resolve([{ action: 'SELL', amount: tradeAmount }]); // Wrapped return
      } else {
        // logger.debug(`[${rsiBollingerStrategy.id}] SELL signal triggered but insufficient shares at index ${currentIndex}. Holding.`);
        return Promise.resolve([{ action: 'HOLD' }]); // Wrapped return
      }
    }

    // logger.debug(`[${rsiBollingerStrategy.id}] No signal at index ${currentIndex}. RSI: ${currentRSI.toFixed(2)}, Price: ${currentPrice.toFixed(2)}, LowerBB: ${currentBollingerLower.toFixed(2)}, UpperBB: ${currentBollingerUpper.toFixed(2)}. Holding.`);
    return Promise.resolve([{ action: 'HOLD' }]); // Wrapped return
  },
};
