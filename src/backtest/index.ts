import { fetchHistoricalDataFromDB, HistoricalDataPoint } from '../services/dataService';
import { logger } from '../utils/logger';

// --- 1. Define Interfaces & Types ---

export type StrategyAction = 'BUY' | 'SELL' | 'HOLD';

export interface Portfolio {
  cash: number;
  shares: number;
  initialValue: number;
  currentValue: number;
}

export interface Trade {
  timestamp: number; // Unix epoch seconds
  date: Date;        // Actual date of the trade
  action: 'BUY' | 'SELL';
  price: number;     // Price per share at which the trade was executed
  sharesTraded: number; // Number of shares bought or sold (renamed from 'shares' to avoid confusion)
  cashAfterTrade: number;
}

export interface StrategyInput {
  dataPoint: HistoricalDataPoint;
  portfolio: Portfolio;
  tradeHistory: Trade[]; // To allow strategies to look at past trades
}

export interface StrategyOutput {
  action: StrategyAction;
  amount?: number; // e.g., number of shares.
}

export type StrategyFunction = (input: StrategyInput) => StrategyOutput;

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
}


// --- 2. Implement a Simple Example Strategy ---

// Example: Simple Threshold Strategy
const UPPER_THRESHOLD_PRICE_EXAMPLE = 150; // Example: Buy if price goes above this
const LOWER_THRESHOLD_PRICE_EXAMPLE = 140; // Example: Sell if price goes below this

export const simpleThresholdStrategy: StrategyFunction = (input: StrategyInput): StrategyOutput => {
  const { dataPoint, portfolio } = input;
  const price = dataPoint.close; // Using close price for decisions and trades

  // BUY Condition
  // For simplicity, amount will be 1 share if not specified by strategy.
  // Ensure portfolio has enough cash for at least 1 share.
  if (price > UPPER_THRESHOLD_PRICE_EXAMPLE && portfolio.cash >= price) {
    return { action: 'BUY', amount: 1 }; // Buy 1 share
  }
  // SELL Condition
  // Ensure portfolio has at least 1 share to sell.
  else if (price < LOWER_THRESHOLD_PRICE_EXAMPLE && portfolio.shares > 0) {
    return { action: 'SELL', amount: 1 }; // Sell 1 share
  }
  // HOLD Condition
  else {
    return { action: 'HOLD' };
  }
};

// --- 3. Implement Core runBacktest Function ---

export async function runBacktest(
  symbol: string,
  startDate: Date,
  endDate: Date,
  initialCash: number,
  strategy: StrategyFunction,
  sourceApi?: string, // Optional: to specify data source for fetchHistoricalDataFromDB
  interval?: string   // Optional: to specify data interval for fetchHistoricalDataFromDB
): Promise<BacktestResult> {
  logger.info(`Starting backtest for ${symbol}`, { startDate, endDate, initialCash, strategyName: strategy.name || 'AnonymousStrategy', sourceApi, interval });

  const portfolio: Portfolio = {
    cash: initialCash,
    shares: 0,
    initialValue: initialCash,
    currentValue: initialCash,
  };

  const tradeHistory: Trade[] = [];

  const historicalData = await fetchHistoricalDataFromDB(symbol, startDate, endDate, sourceApi, interval);

  if (!historicalData || historicalData.length === 0) {
    logger.warn(`No historical data found for ${symbol} between ${startDate.toISOString()} and ${endDate.toISOString()}. Cannot run backtest.`);
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

  logger.info(`Processing ${historicalData.length} data points for backtest...`);

  for (const dataPoint of historicalData) {
    const strategyInput: StrategyInput = {
      dataPoint,
      portfolio,
      tradeHistory, // Pass the current trade history
    };

    const strategyOutput = strategy(strategyInput);
    // Default to trading 1 share if strategyOutput.amount is not specified or is zero/negative
    const sharesToTrade = (strategyOutput.amount && strategyOutput.amount > 0) ? strategyOutput.amount : 1;

    const currentPrice = dataPoint.close; // Assume trades execute at the closing price of the period

    if (strategyOutput.action === 'BUY') {
      const cost = currentPrice * sharesToTrade;
      if (portfolio.cash >= cost) {
        portfolio.cash -= cost;
        portfolio.shares += sharesToTrade;
        const trade: Trade = {
          timestamp: dataPoint.timestamp,
          date: dataPoint.date,
          action: 'BUY',
          price: currentPrice,
          sharesTraded: sharesToTrade,
          cashAfterTrade: portfolio.cash,
        };
        tradeHistory.push(trade);
        logger.debug(`BUY: ${sharesToTrade} shares of ${symbol} at ${currentPrice} on ${dataPoint.date.toISOString()}`, { portfolio });
      } else {
        logger.debug(`Attempted BUY for ${symbol} at ${currentPrice}, but insufficient cash. Needed ${cost}, have ${portfolio.cash}.`, { portfolio });
      }
    } else if (strategyOutput.action === 'SELL') {
      if (portfolio.shares >= sharesToTrade) {
        portfolio.cash += currentPrice * sharesToTrade;
        portfolio.shares -= sharesToTrade;
        const trade: Trade = {
          timestamp: dataPoint.timestamp,
          date: dataPoint.date,
          action: 'SELL',
          price: currentPrice,
          sharesTraded: sharesToTrade,
          cashAfterTrade: portfolio.cash,
        };
        tradeHistory.push(trade);
        logger.debug(`SELL: ${sharesToTrade} shares of ${symbol} at ${currentPrice} on ${dataPoint.date.toISOString()}`, { portfolio });
      } else {
        logger.debug(`Attempted SELL for ${symbol} at ${currentPrice}, but insufficient shares. Have ${portfolio.shares}, tried to sell ${sharesToTrade}.`, { portfolio });
      }
    }
    // For 'HOLD', no action is taken on the portfolio.

    // Update current portfolio value after any potential trade
    portfolio.currentValue = portfolio.cash + portfolio.shares * currentPrice;
  }

  const finalPortfolioValue = portfolio.currentValue;
  const totalProfitOrLoss = finalPortfolioValue - portfolio.initialValue;
  // Handle division by zero if initialPortfolioValue is 0
  const profitOrLossPercentage = portfolio.initialValue === 0 
    ? (totalProfitOrLoss === 0 ? 0 : Infinity) // Or some other representation for gains on 0 initial investment
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
  };

  logger.info(`Backtest completed for ${symbol}`, {
    initialValue: result.initialPortfolioValue,
    finalValue: result.finalPortfolioValue,
    profitOrLoss: result.totalProfitOrLoss,
    profitPercentage: result.profitOrLossPercentage,
    totalTrades: result.totalTrades,
  });

  return result;
}

// --- 4. Export necessary types/interfaces ---
// All necessary items (interfaces, types, functions) are exported using the 'export' keyword above.
// Example: export { StrategyFunction, BacktestResult, runBacktest, simpleThresholdStrategy };
// This is not strictly necessary as they are individually exported.
