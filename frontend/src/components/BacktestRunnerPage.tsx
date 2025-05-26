// frontend/src/components/BacktestRunnerPage.tsx
import React, { useState, useCallback } from 'react'; // Removed useEffect
import axios from 'axios';
import type { AxiosError } from 'axios'; // For type usage if needed
import type {
  TradingStrategy,
  // StrategyParameterDefinition, // Removed as unused
  BacktestSettings,
  BacktestResult,
  ApiError,
  HistoricalDataPoint as FrontendHistoricalDataPoint, // Keep alias for clarity if needed
  Trade, // Use the Trade type from types.ts
} from '../types';
import StrategySelector from './StrategySelector';
import StrategyParameterForm from './StrategyParameterForm';
import BacktestSettingsForm from './BacktestSettingsForm';
import ResultsDisplay from './ResultsDisplay';
import EquityChart from './EquityChart'; // Import EquityChart
import TradesOnPriceChart from './TradesOnPriceChart'; // Import TradesOnPriceChart
import { logger } from '../utils/logger';
// FrontendTrade alias was removed as it's not used after clarifying Trade type.

const BacktestRunnerPage: React.FC = () => {
  // Note: availableStrategies is fetched by StrategySelector itself.
  // We don't need to manage it here if StrategySelector is self-contained for fetching.
  const [selectedStrategy, setSelectedStrategy] = useState<TradingStrategy | null>(null);
  const [currentStrategyParams, setCurrentStrategyParams] = useState<Record<string, any>>({});
  
  // Initial state for backtest settings
  const initialBacktestSettings: BacktestSettings = {
    symbol: 'BTCUSDT', // Default example
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default to 30 days ago
    endDate: new Date().toISOString().split('T')[0], // Default to today
    initialCash: 10000,
    sourceApi: 'Binance', // Default example
    interval: '1d',     // Default example
  };
  const [currentBacktestSettings, setCurrentBacktestSettings] = useState<BacktestSettings>(initialBacktestSettings);
  
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleStrategySelect = useCallback((strategy: TradingStrategy | null) => {
    logger.info('BacktestRunnerPage: Strategy selected', strategy?.name || 'None');
    setSelectedStrategy(strategy);
    setBacktestResult(null); // Clear previous results
    setError(null); // Clear previous errors
    if (strategy) {
      // Initialize params with defaults from the strategy definition
      const defaultParams = strategy.parameters.reduce((acc, param) => {
        acc[param.name] = param.defaultValue;
        return acc;
      }, {} as Record<string, any>);
      setCurrentStrategyParams(defaultParams);
      logger.debug('BacktestRunnerPage: Default params set for selected strategy', defaultParams);
    } else {
      setCurrentStrategyParams({});
    }
  }, []);

  const handleParamsChange = useCallback((params: Record<string, any>) => {
    setCurrentStrategyParams(params);
    logger.debug('BacktestRunnerPage: Strategy params changed', params);
  }, []);

  const handleSettingsChange = useCallback((settings: BacktestSettings) => {
    setCurrentBacktestSettings(settings);
    logger.debug('BacktestRunnerPage: Backtest settings changed', settings);
  }, []);

  const handleRunBacktest = async () => {
    if (!selectedStrategy) {
      setError('Please select a strategy.');
      logger.warn('BacktestRunnerPage: Run attempted without selecting a strategy.');
      return;
    }
    if (!currentBacktestSettings.symbol) {
      setError('Please enter a symbol.');
      logger.warn('BacktestRunnerPage: Run attempted without a symbol.');
      return;
    }
    // Add more basic validation as needed (e.g., dates, initial cash)

    logger.info('BacktestRunnerPage: Running backtest with settings:', {
      strategyId: selectedStrategy.id,
      params: currentStrategyParams,
      settings: currentBacktestSettings,
    });

    setIsLoading(true);
    setBacktestResult(null);
    setError(null);

    const requestBody = {
      strategyId: selectedStrategy.id,
      strategyParams: currentStrategyParams,
      ...currentBacktestSettings,
    };

    try {
      const response = await axios.post<BacktestResult>('/api/backtest', requestBody);
      setBacktestResult(response.data);
      logger.info('BacktestRunnerPage: Backtest successful', response.data);
    } catch (err) {
      const axiosError = err as AxiosError<ApiError>;
      const errorMessage = axiosError.response?.data?.message || axiosError.message || 'An unknown error occurred.';
      setError(errorMessage);
      logger.error('BacktestRunnerPage: Backtest failed', axiosError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="backtest-runner-page">
      <h2>Backtest Configuration</h2>
      
      <div className="backtest-section config-section">
        <StrategySelector onStrategySelect={handleStrategySelect} />
        <StrategyParameterForm 
          strategy={selectedStrategy} 
          onParamsChange={handleParamsChange}
          initialParams={currentStrategyParams}
        />
      </div>
      
      <div className="backtest-section settings-section">
        <BacktestSettingsForm 
          onSettingsChange={handleSettingsChange} 
          initialSettings={currentBacktestSettings}
        />
      </div>
      
      <button 
        onClick={handleRunBacktest} 
        disabled={isLoading || !selectedStrategy}
        className="run-backtest-button" // Added class for potential specific styling
      >
        {isLoading ? 'Running...' : 'Run Backtest'}
      </button>
      
      <div className="results-section"> {/* No backtest-section class for results unless desired */}
        <ResultsDisplay results={backtestResult} error={error} loading={isLoading} />
        
        {/* Render charts if results are available */}
        {backtestResult && !error && (
          <div className="charts-section" style={{ marginTop: '20px' }}>
            {/* Equity Chart */}
            {backtestResult.portfolioHistory && backtestResult.portfolioHistory.length > 0 && (
              <EquityChart 
                data={backtestResult.portfolioHistory} 
              />
            )}

            {/* Trades on Price Chart */}
            {backtestResult.historicalDataUsed && backtestResult.historicalDataUsed.length > 0 && backtestResult.trades && (
              <TradesOnPriceChart 
                priceData={backtestResult.historicalDataUsed as ReadonlyArray<FrontendHistoricalDataPoint>} 
                tradesData={backtestResult.trades.map((trade: Trade) => ({ // Ensure this map produces what TradesOnPriceChart expects
                  timestamp: trade.timestamp, // Assuming TradesOnPriceChart expects these field names
                  date: trade.date,
                  action: trade.action,
                  price: trade.price,
                  sharesTraded: trade.sharesTraded,
                  cashAfterTrade: trade.cashAfterTrade
                }))}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BacktestRunnerPage;
