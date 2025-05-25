// In src/strategies/strategy.types.ts
import { HistoricalDataPoint } from '../services/dataService'; // Assuming HistoricalDataPoint is from dataService
import { Portfolio, Trade } from '../backtest'; // Assuming Portfolio and Trade are from backtest

export type StrategyParameterType = 'number' | 'string' | 'boolean';

export interface StrategyParameterDefinition {
  name: string;                 // Parameter name (e.g., 'smaPeriod', 'rsiLevel')
  label: string;                // User-friendly label (e.g., 'SMA Period', 'RSI Overbought Level')
  type: StrategyParameterType;
  defaultValue: number | string | boolean;
  description?: string;
  min?: number; // Optional: for number types
  max?: number; // Optional: for number types
  step?: number; // Optional: for number types
}

export interface StrategyContext {
  historicalData: HistoricalDataPoint[]; // Array of historical data points up to the current point for indicator calculation
  currentIndex: number;                // Index of the current dataPoint within historicalData
  portfolio: Portfolio;
  tradeHistory: Trade[];
  parameters: Record<string, number | string | boolean>; // Strategy-specific parameters
}

export type StrategyAction = 'BUY' | 'SELL' | 'HOLD';

export interface StrategySignal {
  action: StrategyAction;
  amount?: number; // Number of shares or percentage of portfolio to trade
}

export interface TradingStrategy {
  id: string; // Unique identifier (e.g., 'ichimoku-cloud', 'rsi-bollinger')
  name: string; // User-friendly name (e.g., 'Ichimoku Cloud Strategy', 'RSI + Bollinger Bands')
  description?: string;
  parameters: StrategyParameterDefinition[]; // Definitions of parameters this strategy uses

  // Function to execute the strategy for a given historical data point and context
  execute: (context: StrategyContext) => StrategySignal;

  // Optional: Function to calculate and return any indicators the strategy might expose for plotting/logging
  // getIndicators?: (context: StrategyContext) => Record<string, number | null>;
}
