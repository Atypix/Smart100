// frontend/src/components/BacktestRunnerPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import axios, { AxiosError } from 'axios';
import {
  TradingStrategy,
  StrategyParameterDefinition,
  BacktestSettings,
  BacktestResult,
  ApiError,
} from '../types';
import StrategySelector from './StrategySelector';
import StrategyParameterForm from './StrategyParameterForm';
import BacktestSettingsForm from './BacktestSettingsForm';
import ResultsDisplay from './ResultsDisplay';
import { logger } from '../utils/logger';

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
      </div>
    </div>
  );
};

export default BacktestRunnerPage;
