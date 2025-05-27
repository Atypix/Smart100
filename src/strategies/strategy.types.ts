// In src/strategies/strategy.types.ts
import { HistoricalDataPoint } from '../services/dataService'; // Direct import for internal use
import type { Portfolio, Trade } from '../backtest'; // Direct import for internal use, assuming they are exported from backtest


export type StrategyParameterType = 'number' | 'string' | 'boolean';

export interface StrategyParameterDefinition {
  name: string;                 // Parameter name (e.g., 'smaPeriod', 'rsiLevel')
  label: string;                // User-friendly label (e.g., 'SMA Period', 'RSI Overbought Level')
  type: StrategyParameterType;
  defaultValue: number | string | boolean;
  description?: string;
  options?: Array<{ value: string | number; label: string }>; // For string/number types to provide selection options
  min?: number;    // New: for numerical parameters
  max?: number;    // New: for numerical parameters
  step?: number;   // New: for numerical parameters, defines increment for grid search
}

export interface StrategyContext<T_Params extends Record<string, any> = Record<string, any>> {
  symbol: string; // Added
  historicalData: HistoricalDataPoint[]; // Array of historical data points up to the current point for indicator calculation
  currentIndex: number;                // Index of the current dataPoint within historicalData
  portfolio: Portfolio;
  tradeHistory: Trade[];
  parameters: T_Params; // Strategy-specific parameters
}

export type StrategyAction = 'BUY' | 'SELL' | 'HOLD';

export interface StrategySignal {
  action: StrategyAction;
  amount?: number; // Number of shares or percentage of portfolio to trade
}

export interface TradingStrategy<T_Parameters extends Record<string, any> = Record<string, any>> {
  id: string; // Unique identifier (e.g., 'ichimoku-cloud', 'rsi-bollinger')
  name: string; // User-friendly name (e.g., 'Ichimoku Cloud Strategy', 'RSI + Bollinger Bands')
  description?: string;
  parameters: StrategyParameterDefinition[]; // Definitions of parameters this strategy uses

  // Function to execute the strategy for a given historical data point and context
  execute: (context: StrategyContext<T_Parameters>) => StrategySignal | Promise<StrategySignal>; // Allow async strategies

  // Optional: Function to calculate and return any indicators the strategy might expose for plotting/logging
  // getIndicators?: (context: StrategyContext<T_Parameters>) => Record<string, number | null>;
}

export interface AIDecision {
  timestamp: number;
  date: string; // Assuming date is stored as string in historical data
  chosenStrategyId: string | null;
  chosenStrategyName: string | null;
  parametersUsed: Record<string, any> | null;
  evaluationScore: number | null;
  evaluationMetricUsed: string | null;
  // Optionally, add other details like P&L of all candidates, etc.
}
