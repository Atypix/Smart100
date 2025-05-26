import { fetchHistoricalDataFromDB, HistoricalDataPoint } from '../services/dataService';
import logger from '../utils/logger'; // Corrected import
import { 
  TradingStrategy, 
  StrategyContext, 
  StrategySignal, 
  StrategyParameterDefinition,
  StrategyAction // Already defined locally, but can be imported for consistency
} from '../strategies';

// --- 1. Define Interfaces & Types (Local to backtest, some might be deprecated by strategy.types.ts) ---

// export type StrategyAction = 'BUY' | 'SELL' | 'HOLD'; // Now from ../strategies

export interface Portfolio {
  cash: number;
  shares: number;
  initialValue: number;
  currentValue: number;
}

export interface Trade {
  timestamp: number; // Unix epoch seconds
  date: Date;        // Actual date of the trade
  action: 'BUY' | 'SELL'; // Note: StrategyAction from strategy.types.ts is 'BUY' | 'SELL' | 'HOLD'
  price: number;     // Price per share at which the trade was executed
  sharesTraded: number; 
  cashAfterTrade: number;
}

// StrategyInput and StrategyOutput are effectively replaced by StrategyContext and StrategySignal
// export interface StrategyInput {
//   dataPoint: HistoricalDataPoint;
//   portfolio: Portfolio;
//   tradeHistory: Trade[]; 
// }
// export interface StrategyOutput {
//   action: StrategyAction;
//   amount?: number; 
// }
// export type StrategyFunction = (input: StrategyInput) => StrategyOutput; // Replaced by TradingStrategy interface

export interface BacktestResult {
  symbol: string;
  startDate: Date;
  endDate: Date;
  initialPortfolioValue: number;
  finalPortfolioValue: number;
  totalProfitOrLoss: number;
  profitOrLossPercentage: number;
  trades: Trade[];
  totalTrades: number;
  dataPointsProcessed: number; // Added for clarity
  historicalDataUsed?: HistoricalDataPoint[];
  portfolioHistory?: { timestamp: number; value: number }[]; // Added for equity curve
}


// --- 2. Implement a Simple Example Strategy ---

// --- 2. Implement a Simple Example Strategy (Adapted to new TradingStrategy interface) ---

const simpleThresholdStrategyParams: StrategyParameterDefinition[] = [
  { name: 'upperThreshold', label: 'Upper Threshold', type: 'number', defaultValue: 150, description: 'Price above which to buy.' },
  { name: 'lowerThreshold', label: 'Lower Threshold', type: 'number', defaultValue: 140, description: 'Price below which to sell.' },
  { name: 'tradeAmount', label: 'Trade Amount', type: 'number', defaultValue: 1, description: 'Number of shares to trade.'}
];

export const adaptedSimpleThresholdStrategy: TradingStrategy = {
  id: 'simple-threshold',
  name: 'Simple Threshold Strategy',
  description: 'Buys if price > upperThreshold, Sells if price < lowerThreshold.',
  parameters: simpleThresholdStrategyParams,
  execute: (context: StrategyContext): StrategySignal => {
    const currentDataPoint = context.historicalData[context.currentIndex];
    const price = currentDataPoint.close;
    const upperThreshold = context.parameters.upperThreshold as number;
    const lowerThreshold = context.parameters.lowerThreshold as number;
    const tradeAmount = context.parameters.tradeAmount as number;

    if (price > upperThreshold && context.portfolio.cash >= price * tradeAmount) {
      return { action: 'BUY', amount: tradeAmount };
    } else if (price < lowerThreshold && context.portfolio.shares >= tradeAmount) {
      return { action: 'SELL', amount: tradeAmount };
    } else {
      return { action: 'HOLD' };
    }
  },
};

import { getStrategy } from '../strategies'; // Import the strategy manager function

// --- 2. Implement a Simple Example Strategy (Adapted to new TradingStrategy interface) ---
// The adaptedSimpleThresholdStrategy is now in src/strategies/implementations/ and registered via strategyManager.ts
// We can remove its definition from here.
// const simpleThresholdStrategyParams: StrategyParameterDefinition[] = [ ... ];
// export const adaptedSimpleThresholdStrategy: TradingStrategy = { ... };

// Placeholder for Strategy Registry/Manager - REMOVED
// const availableStrategies: Record<string, TradingStrategy> = { ... };


// --- 3. Implement Core runBacktest Function ---

export async function runBacktest(
  symbol: string,
  startDate: Date,
  endDate: Date,
  initialCash: number,
  strategyId: string, 
  strategyParams: Record<string, number | string | boolean>,
  sourceApi?: string, 
  interval?: string   
): Promise<BacktestResult> {
  
  const selectedStrategy = getStrategy(strategyId); // Use the strategy manager

  if (!selectedStrategy) {
    logger.error(`Strategy with ID '${strategyId}' not found. Aborting backtest.`);
    // Return a default/error BacktestResult
    return {
      symbol,
      startDate,
      endDate,
      initialPortfolioValue: initialCash,
      finalPortfolioValue: initialCash,
      totalProfitOrLoss: 0,
      profitOrLossPercentage: 0,
      trades: [],
      totalTrades: 0,
      dataPointsProcessed: 0,
    };
  }
  
  // Validate and merge provided strategyParams with defaults from selectedStrategy.parameters
  // For simplicity in this step, we'll directly use strategyParams, assuming they are complete and correct.
  // A more robust implementation would validate types and use defaults if params are missing.
  const effectiveStrategyParams = { ...strategyParams }; // Simplified for now
  // Example of merging with defaults (can be more elaborate):
  selectedStrategy.parameters.forEach(paramDef => {
    if (effectiveStrategyParams[paramDef.name] === undefined) {
        effectiveStrategyParams[paramDef.name] = paramDef.defaultValue;
    }
  });


  logger.info(`Starting backtest for ${symbol}`, { 
    startDate, 
    endDate, 
    initialCash, 
    strategyId: selectedStrategy.id, 
    strategyName: selectedStrategy.name,
    strategyParams: effectiveStrategyParams,
    sourceApi, 
    interval 
  });

  const portfolio: Portfolio = {
    cash: initialCash,
    shares: 0,
    initialValue: initialCash,
    currentValue: initialCash,
  };

  const tradeHistory: Trade[] = [];

  const historicalData = await fetchHistoricalDataFromDB(symbol, startDate, endDate, sourceApi, interval);

  if (!historicalData || historicalData.length === 0) {
    logger.warn(`No historical data found for ${symbol} between ${startDate.toISOString()} and ${endDate.toISOString()} for strategy ${selectedStrategy.name}. Cannot run backtest.`);
    return {
      symbol,
      startDate,
      endDate,
      initialPortfolioValue: initialCash,
      finalPortfolioValue: initialCash,
      totalProfitOrLoss: 0,
      profitOrLossPercentage: 0,
      trades: [],
      totalTrades: 0,
      dataPointsProcessed: 0,
    };
  }

  logger.info(`Processing ${historicalData.length} data points for backtest using strategy: ${selectedStrategy.name}...`);
  
  const portfolioHistoryTimeline: { timestamp: number; value: number }[] = []; // For equity curve

  for (let i = 0; i < historicalData.length; i++) {
    // Record portfolio value at the START of the period (before current data point is processed)
    // or after, depending on when you want to reflect the value.
    // Let's record it *before* processing the current day's signal and potential trade,
    // but after the previous day's trades have settled and price updated.
    // So, at the beginning of the loop, using previous day's close for shares value if i > 0
    // or initial value if i === 0.
    // Simpler: record after current day's processing.
    
    const context: StrategyContext = {
      historicalData: historicalData,
      currentIndex: i,
      portfolio: { ...portfolio }, // Pass a copy to prevent direct modification by strategy
      tradeHistory: [...tradeHistory], // Pass a copy
      parameters: effectiveStrategyParams,
    };

    const signal = await Promise.resolve(selectedStrategy.execute(context)); // Handle sync/async strategies
    
    // Default to trading 1 share if signal.amount is not specified or is zero/negative
    // This logic could also be strategy-specific or part of portfolio management.
    const sharesToTrade = (signal.amount && signal.amount > 0) ? signal.amount : 1;
    const currentPrice = historicalData[i].close; // Assume trades execute at the closing price of the current period

    if (signal.action === 'BUY') {
      const cost = currentPrice * sharesToTrade;
      if (portfolio.cash >= cost) {
        portfolio.cash -= cost;
        portfolio.shares += sharesToTrade;
        const trade: Trade = {
          timestamp: historicalData[i].timestamp,
          date: historicalData[i].date,
          action: 'BUY',
          price: currentPrice,
          sharesTraded: sharesToTrade,
          cashAfterTrade: portfolio.cash,
        };
        tradeHistory.push(trade);
        logger.debug(`BUY: ${sharesToTrade} shares of ${symbol} at ${currentPrice} on ${historicalData[i].date.toISOString()} via ${selectedStrategy.name}`, { portfolio });
      } else {
        logger.debug(`Attempted BUY for ${symbol} at ${currentPrice} via ${selectedStrategy.name}, but insufficient cash. Needed ${cost}, have ${portfolio.cash}.`, { portfolio });
      }
    } else if (signal.action === 'SELL') {
      if (portfolio.shares >= sharesToTrade) {
        portfolio.cash += currentPrice * sharesToTrade;
        portfolio.shares -= sharesToTrade;
        const trade: Trade = {
          timestamp: historicalData[i].timestamp,
          date: historicalData[i].date,
          action: 'SELL',
          price: currentPrice,
          sharesTraded: sharesToTrade,
          cashAfterTrade: portfolio.cash,
        };
        tradeHistory.push(trade);
        logger.debug(`SELL: ${sharesToTrade} shares of ${symbol} at ${currentPrice} on ${historicalData[i].date.toISOString()} via ${selectedStrategy.name}`, { portfolio });
      } else {
        logger.debug(`Attempted SELL for ${symbol} at ${currentPrice} via ${selectedStrategy.name}, but insufficient shares. Have ${portfolio.shares}, tried to sell ${sharesToTrade}.`, { portfolio });
      }
    }
    // For 'HOLD', no action is taken on the portfolio.

    // Update current portfolio value after any potential trade
    portfolio.currentValue = portfolio.cash + portfolio.shares * currentPrice;
    portfolioHistoryTimeline.push({ timestamp: historicalData[i].timestamp, value: portfolio.currentValue });
  }

  const finalPortfolioValue = portfolio.currentValue;
  const totalProfitOrLoss = finalPortfolioValue - portfolio.initialValue;
  const profitOrLossPercentage = portfolio.initialValue === 0 
    ? (totalProfitOrLoss === 0 ? 0 : Infinity) 
    : (totalProfitOrLoss / portfolio.initialValue) * 100;

  const result: BacktestResult = {
    symbol,
    startDate,
    endDate,
    initialPortfolioValue: portfolio.initialValue,
    finalPortfolioValue,
    totalProfitOrLoss,
    profitOrLossPercentage,
    trades: tradeHistory,
    totalTrades: tradeHistory.length,
    dataPointsProcessed: historicalData.length,
    historicalDataUsed: historicalData, // Include the historical data
    portfolioHistory: portfolioHistoryTimeline, // Include portfolio history
  };

  logger.info(`Backtest completed for ${symbol} using strategy ${selectedStrategy.name}`, {
    initialValue: result.initialPortfolioValue,
    finalValue: result.finalPortfolioValue,
    profitOrLoss: result.totalProfitOrLoss,
    profitPercentage: result.profitOrLossPercentage,
    totalTrades: result.totalTrades,
  });

  return result;
}

// --- 4. Export necessary types/interfaces ---
// Most types/interfaces are now imported or defined inline.
// Ensure that any types specifically needed by external modules that import from backtest/index.ts are exported.
// For example, Portfolio, Trade, BacktestResult are still relevant.
// The adaptedSimpleThresholdStrategy is NO LONGER exported from here.
// export { Portfolio, Trade, BacktestResult, runBacktest };
// Individual exports above are sufficient.
