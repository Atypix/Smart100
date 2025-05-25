// frontend/src/types.ts

// --- Strategy Related Types (mirrors backend API response for /api/strategies) ---
export type StrategyParameterType = 'number' | 'string' | 'boolean';

export interface StrategyParameterDefinition {
  name: string;
  label: string;
  type: StrategyParameterType;
  defaultValue: number | string | boolean;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface TradingStrategy {
  id: string;
  name: string;
  description?: string;
  parameters: StrategyParameterDefinition[];
  // Note: The 'execute' method is backend-only, not needed for frontend display model
}

// --- Backtest Settings (Form Data) ---
export interface BacktestSettings {
  symbol: string;
  startDate: string; // Store as YYYY-MM-DD string from date input
  endDate: string;   // Store as YYYY-MM-DD string from date input
  initialCash: number;
  sourceApi?: string;
  interval?: string;
}

// --- Backtest Result (mirrors backend API response for /api/backtest) ---
export interface Trade {
  timestamp: number;
  date: string; // Date string from backend
  action: 'BUY' | 'SELL';
  price: number;
  sharesTraded: number;
  cashAfterTrade: number;
}

export interface BacktestResult {
  symbol: string;
  startDate: string; // Date string from backend
  endDate: string;   // Date string from backend
  initialPortfolioValue: number;
  finalPortfolioValue: number;
  totalProfitOrLoss: number;
  profitOrLossPercentage: number;
  trades: Trade[];
  totalTrades: number;
  dataPointsProcessed: number;
}

// --- API Error Structure (example) ---
export interface ApiError {
  message: string;
  error?: string; // Specific error details from backend
}

// --- API Key Management Types ---
export interface ApiKey {
  id: string;
  user_id: string; // Usually not displayed but good to have
  exchange_name: string;
  api_key: string; // The actual key - be careful with displaying this
  api_secret: string; // The actual secret - DO NOT DISPLAY, for edit re-entry only
  created_at: number; // Timestamp
  updated_at: number; // Timestamp
}

export interface ApiKeyFormData {
  exchange_name: string;
  api_key: string;
  api_secret: string;
}
