// src/types.ts

// Parameters for a trading strategy
export type TradingStrategyParameters = Record<string, number | string | boolean>;

// Settings for a backtest received by the API
export interface BacktestSettingsAPI {
  strategyId: string;
  strategyParams: TradingStrategyParameters;
  symbol: string;
  startDate: string; // Dates as strings from JSON payload
  endDate: string;   // Dates as strings from JSON payload
  initialCash: number;
  sourceApi?: string;
  interval?: string;
}

// Structure of a trade (can be refined or imported if defined elsewhere)
export interface Trade {
  timestamp: number;
  date: string; // Date string
  action: 'BUY' | 'SELL';
  price: number;
  sharesTraded: number;
  cashAfterTrade: number;
}

// Structure for historical data points (can be refined)
export interface HistoricalDataPoint {
    timestamp: number;
    date: string; // Date string
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

// Structure for portfolio history points
export interface PortfolioHistoryPoint {
    timestamp: number;
    value: number;
}

// AI Decision Log (align with frontend/src/types.ts if possible or define consistently)
export interface AIDecision {
  timestamp: number;
  date: string; // Date string
  chosenStrategyId: string | null;
  chosenStrategyName?: string | null;
  parametersUsed?: Record<string, any> | null;
  evaluationScore?: number | null;
  evaluationMetricUsed?: string | null;
}


// Overall result of a backtest (aligns with src/backtest/index.ts BacktestResult)
// This will be the structure returned by the API
export interface BacktestResultAPI {
  symbol: string;
  startDate: string; // Dates as strings
  endDate: string;   // Dates as strings
  initialPortfolioValue: number;
  finalPortfolioValue: number;
  totalProfitOrLoss: number;
  profitOrLossPercentage: number;
  trades: Trade[];
  totalTrades: number;
  dataPointsProcessed: number;
  historicalDataUsed?: HistoricalDataPoint[];
  portfolioHistory?: PortfolioHistoryPoint[];
  aiDecisionLog?: AIDecision[];
  sharpeRatio?: number; // Added for Sharpe Ratio
  maxDrawdown?: number; // Added for Maximum Drawdown
}
