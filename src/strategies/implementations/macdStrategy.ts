import { TradingStrategy, StrategyContext, StrategySignal, StrategyParameterDefinition } from '../strategy.types';
import { calculateMACD } from '../../utils/technicalIndicators';
import { HistoricalDataPoint } from '../../services/dataService';
import logger from '../../utils/logger'; // Optional for debugging - Changed to default import

const macdStrategyParameters: StrategyParameterDefinition[] = [
  {
    name: 'shortPeriod',
    label: 'Short EMA Period',
    type: 'number',
    defaultValue: 12,
    description: 'The period for the shorter term Exponential Moving Average.',
    min: 1,
    max: 50,
    step: 1,
  },
  {
    name: 'longPeriod',
    label: 'Long EMA Period',
    type: 'number',
    defaultValue: 26,
    description: 'The period for the longer term Exponential Moving Average.',
    min: 2, // Must be greater than shortPeriod
    max: 100,
    step: 1,
  },
  {
    name: 'signalPeriod',
    label: 'Signal Line EMA Period',
    type: 'number',
    defaultValue: 9,
    description: 'The period for the EMA of the MACD line, used as the signal line.',
    min: 1,
    max: 50,
    step: 1,
  },
  {
    name: 'tradeAmount',
    label: 'Trade Amount',
    type: 'number',
    defaultValue: 1,
    description: 'Number of shares/units to trade per signal.',
    min: 0.001,
    step: 0.001,
  }
];

export const macdStrategy: TradingStrategy = {
  id: 'macd-crossover',
  name: 'MACD Crossover Strategy',
  description: 'Generates BUY signals when the MACD line crosses above the Signal line, and SELL signals when it crosses below.',
  parameters: macdStrategyParameters,

  async execute(context: StrategyContext): Promise<StrategySignal[]> { // Changed signature
    const { historicalData, currentIndex, portfolio, parameters } = context;
    const {
      shortPeriod,
      longPeriod,
      signalPeriod,
      tradeAmount
    } = parameters as {
      shortPeriod: number;
      longPeriod: number;
      signalPeriod: number;
      tradeAmount: number;
    };

    // Ensure there's at least one previous data point to check for a crossover
    if (currentIndex < 1) {
      // logger.debug(`[${macdStrategy.id}] Not enough data for crossover detection at index ${currentIndex}. Holding.`);
      return Promise.resolve([{ action: 'HOLD' }]); // Wrapped return
    }

    // Validate that longPeriod is greater than shortPeriod (already in parameter definition, but good for robustness)
    if (longPeriod <= shortPeriod) {
        // logger.warn(`[${macdStrategy.id}] Long period (${longPeriod}) must be greater than short period (${shortPeriod}). Holding.`);
        return Promise.resolve([{action: 'HOLD'}]); // Wrapped return
    }

    const closingPrices = historicalData.map((d: HistoricalDataPoint) => d.close);
    const macdOutput = calculateMACD(closingPrices, shortPeriod, longPeriod, signalPeriod);

    const currentMACD = macdOutput.macdLine[currentIndex];
    const previousMACD = macdOutput.macdLine[currentIndex - 1];
    const currentSignal = macdOutput.signalLine[currentIndex];
    const previousSignal = macdOutput.signalLine[currentIndex - 1];

    if (
      isNaN(currentMACD) ||
      isNaN(previousMACD) ||
      isNaN(currentSignal) ||
      isNaN(previousSignal)
    ) {
      // logger.debug(`[${macdStrategy.id}] NaN MACD/Signal value at index ${currentIndex} or ${currentIndex-1}. Holding.`);
      return Promise.resolve([{ action: 'HOLD' }]); // Wrapped return
    }

    const currentPrice = historicalData[currentIndex].close;

    // BUY Signal: MACD line crosses above Signal line
    if (previousMACD < previousSignal && currentMACD > currentSignal) {
      if (portfolio.cash >= currentPrice * tradeAmount) {
        // logger.info(`[${macdStrategy.id}] BUY signal at index ${currentIndex}: MACD (${currentMACD.toFixed(2)}) crossed above Signal (${currentSignal.toFixed(2)})`);
        return Promise.resolve([{ action: 'BUY', amount: tradeAmount }]); // Wrapped return
      } else {
        // logger.debug(`[${macdStrategy.id}] BUY signal triggered but insufficient cash at index ${currentIndex}. Holding.`);
        return Promise.resolve([{ action: 'HOLD' }]); // Wrapped return
      }
    }

    // SELL Signal: MACD line crosses below Signal line
    if (previousMACD > previousSignal && currentMACD < currentSignal) {
      if (portfolio.shares >= tradeAmount) {
        // logger.info(`[${macdStrategy.id}] SELL signal at index ${currentIndex}: MACD (${currentMACD.toFixed(2)}) crossed below Signal (${currentSignal.toFixed(2)})`);
        return Promise.resolve([{ action: 'SELL', amount: tradeAmount }]); // Wrapped return
      } else {
        // logger.debug(`[${macdStrategy.id}] SELL signal triggered but insufficient shares at index ${currentIndex}. Holding.`);
        return Promise.resolve([{ action: 'HOLD' }]); // Wrapped return
      }
    }
    
    // logger.debug(`[${macdStrategy.id}] No crossover at index ${currentIndex}. PrevMACD: ${previousMACD.toFixed(2)}, CurrMACD: ${currentMACD.toFixed(2)}, PrevSignal: ${previousSignal.toFixed(2)}, CurrSignal: ${currentSignal.toFixed(2)}. Holding.`);
    return Promise.resolve([{ action: 'HOLD' }]); // Wrapped return
  },
};
