import { fetchHistoricalDataFromDB, HistoricalDataPoint } from '../services/dataService';
import logger from '../utils/logger'; // Corrected import
import { 
  TradingStrategy, 
  StrategyContext, 
  StrategySignal, 
  StrategyParameterDefinition,
  AIDecision // Import the new AIDecision interface
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
  aiDecisionLog?: AIDecision[]; // Add the AI decision log
  sharpeRatio?: number; // Added for Sharpe Ratio
  maxDrawdown?: number; // Added for Maximum Drawdown
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
  const aiDecisionLog: AIDecision[] = []; // Initialize AI decision log

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
  let peakPortfolioValue = initialCash;
  let maxDrawdown = 0;

  // Initialize portfolio history with the starting value
  if (historicalData.length > 0) {
      // Assuming the first data point's timestamp is representative for the start
      // or use a dedicated start timestamp if available and more accurate.
      // For drawdown calculation, the first point in history should be initialCash.
      portfolioHistoryTimeline.push({ timestamp: historicalData[0].timestamp, value: initialCash });
  }


  for (let i = 0; i < historicalData.length; i++) {
    // Record portfolio value at the START of the period (before current data point is processed)
    // or after, depending on when you want to reflect the value.
    // Let's record it *before* processing the current day's signal and potential trade,
    // but after the previous day's trades have settled and price updated.
    // So, at the beginning of the loop, using previous day's close for shares value if i > 0
    // or initial value if i === 0.
    // Simpler: record after current day's processing.
    
    const context: StrategyContext<Record<string, any>> = { // Explicitly use generic
      symbol: symbol, // Added
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

    // Update peak portfolio value and calculate max drawdown
    peakPortfolioValue = Math.max(peakPortfolioValue, portfolio.currentValue);
    if (peakPortfolioValue > 0) { // Avoid division by zero if peak is somehow 0
        const currentDrawdown = (peakPortfolioValue - portfolio.currentValue) / peakPortfolioValue;
        maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
    }

    // Record portfolio value for history AFTER all calculations for the current period, including drawdown
    portfolioHistoryTimeline.push({ timestamp: historicalData[i].timestamp, value: portfolio.currentValue });


    // Collect AI Decision Log if applicable
    if (selectedStrategy.id === 'ai-selector' && (selectedStrategy as any).lastAIDecision) {
        const decisionToLog = (selectedStrategy as any).lastAIDecision as AIDecision;
        // Ensure the decision timestamp matches the current bar's timestamp for consistency in the log
        if (decisionToLog.timestamp === historicalData[i].timestamp) {
            aiDecisionLog.push({ ...decisionToLog });
        } else {
            // This case might occur if AI selector's execute doesn't make a decision for every bar
            // or if its internal timestamping logic differs. Log with a warning or adjust as needed.
            logger.debug(`[runBacktest] AI decision timestamp mismatch. Logged decision for ${new Date(decisionToLog.timestamp).toISOString()} at bar ${new Date(historicalData[i].timestamp).toISOString()}`);
            aiDecisionLog.push({ 
                ...decisionToLog, 
                // Override timestamp/date to match current processing point if strictly desired,
                // but original timestamp from decision is usually more accurate to when decision was made.
                // For now, keep original decision timestamp.
            });
        }
        // Reset for next potential decision by AI selector on a subsequent bar
        (selectedStrategy as any).lastAIDecision = null; 
    }
  }

  const finalPortfolioValue = portfolio.currentValue;
  const totalProfitOrLoss = finalPortfolioValue - portfolio.initialValue;
  const profitOrLossPercentage = portfolio.initialValue === 0 
    ? (totalProfitOrLoss === 0 ? 0 : Infinity) 
    : (totalProfitOrLoss / portfolio.initialValue) * 100;

  // Calculate Sharpe Ratio
  let sharpeRatio: number | undefined = undefined;
  if (portfolioHistoryTimeline && portfolioHistoryTimeline.length >= 2) {
    const periodReturns: number[] = [];
    for (let k = 1; k < portfolioHistoryTimeline.length; k++) {
      const prevValue = portfolioHistoryTimeline[k-1].value;
      const currentValue = portfolioHistoryTimeline[k].value;
      if (prevValue !== 0) {
        periodReturns.push((currentValue - prevValue) / prevValue);
      } else {
        periodReturns.push(0); // Or handle as appropriate, e.g., if value can go to 0 and recover
      }
    }

    if (periodReturns.length > 1) {
      const averageReturn = periodReturns.reduce((sum, ret) => sum + ret, 0) / periodReturns.length;
      const stdDevReturns = Math.sqrt(
        periodReturns.map(ret => Math.pow(ret - averageReturn, 2)).reduce((sum, sq) => sum + sq, 0) / (periodReturns.length -1) // Use n-1 for sample std dev
      );

      if (stdDevReturns !== 0) {
        const riskFreeRate = 0; // Assuming Rf = 0 for simplicity
        const sharpeRatioPeriod = (averageReturn - riskFreeRate) / stdDevReturns;
        // Annualize Sharpe Ratio, assuming daily data if not specified otherwise (N=252)
        // A more robust solution would determine N based on data interval
        const annualizationFactor = Math.sqrt(252);
        sharpeRatio = sharpeRatioPeriod * annualizationFactor;
      } else {
        sharpeRatio = 0; // Or NaN, if averageReturn is non-zero and stdDev is zero (constant returns)
      }
    } else {
      sharpeRatio = 0; // Not enough returns to calculate std dev
    }
  } else {
    sharpeRatio = 0; // Not enough portfolio history points
  }

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
    aiDecisionLog: aiDecisionLog.length > 0 ? aiDecisionLog : undefined, // Add AI decision log
    sharpeRatio: sharpeRatio, // Add Sharpe Ratio to results
    maxDrawdown: maxDrawdown, // Add Max Drawdown to results
  };

  const logDetails = {
    initialValue: result.initialPortfolioValue,
    finalValue: result.finalPortfolioValue,
    profitOrLoss: result.totalProfitOrLoss,
    profitPercentage: result.profitOrLossPercentage,
    totalTrades: result.totalTrades,
  };
  if (result.totalTrades === 0) {
    logger.info(`Backtest completed for ${symbol} using strategy ${selectedStrategy.name}. No trades were executed.`, logDetails);
  } else {
    logger.info(`Backtest completed for ${symbol} using strategy ${selectedStrategy.name}.`, logDetails);
  }

  return result;
}

// --- 4. Export necessary types/interfaces ---
// Most types/interfaces are now imported or defined inline.
// Ensure that any types specifically needed by external modules that import from backtest/index.ts are exported.
// For example, Portfolio, Trade, BacktestResult are still relevant.
// The adaptedSimpleThresholdStrategy is NO LONGER exported from here.
// export { Portfolio, Trade, BacktestResult, runBacktest };
// Individual exports above are sufficient.
