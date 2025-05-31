// frontend/src/components/BacktestRunnerPage.tsx
import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import type { AxiosError } from 'axios';
import type {
  TradingStrategy,
  // StrategyParameterDefinition, // Removed as unused
  BacktestSettings,
  BacktestResult,
  ApiError,
  HistoricalDataPoint as FrontendHistoricalDataPoint, // Keep alias for clarity if needed
  Trade, // Use the Trade type from types.ts
  SuggestionResponse, // Import the new type
} from '../types';
import { fetchStrategySuggestion } from '../services/api'; // Import the new API function
import StrategySelector from './StrategySelector';
import StrategyParameterForm from './StrategyParameterForm';
import BacktestSettingsForm from './BacktestSettingsForm';
import ResultsDisplay from './ResultsDisplay';
import EquityChart from './EquityChart'; // Import EquityChart
import TradesOnPriceChart from './TradesOnPriceChart';
import { logger } from '../utils/logger';
import { getAICurrentStrategy, type AIChoiceResponse } from '../services/api'; // Import AI choice function and type

const BacktestRunnerPage: React.FC = () => {
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
  const [isLoading, setIsLoading] = useState<boolean>(false); // For main backtest run
  const [error, setError] = useState<string | null>(null); // For main backtest run

  // State for AI Selector Strategy Choice (when ai-selector is chosen)
  const [aiChosenStrategyInfo, setAiChosenStrategyInfo] = useState<AIChoiceResponse | null>(null);
  const [isFetchingAIChoice, setIsFetchingAIChoice] = useState<boolean>(false);
  const [aiChoiceError, setAiChoiceError] = useState<string | null>(null);

  // State for Smart Strategy Suggestion Feature
  const [initialCapitalForSuggestion, setInitialCapitalForSuggestion] = useState<number>(10000); // Default capital for suggestion
  const [suggestionResult, setSuggestionResult] = useState<SuggestionResponse | null>(null);
  const [isFetchingSuggestion, setIsFetchingSuggestion] = useState<boolean>(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null); // For suggestion fetching errors

  const [availableStrategies, setAvailableStrategies] = useState<TradingStrategy[]>([]);

  // Fetch available strategies once on mount for the "Apply to Parameters" feature
  useEffect(() => {
    axios.get<TradingStrategy[]>('/api/strategies')
      .then(response => {
        setAvailableStrategies(response.data);
        logger.info('[BacktestRunnerPage] Fetched available strategies for suggestion application:', response.data.length);
      })
      .catch(error => {
        logger.error('[BacktestRunnerPage] Error fetching available strategies:', error);
        // Optionally set an error state here if this list is critical for other features too
        // For now, we'll assume StrategySelector handles its own error display for this list.
      });
  }, []);


  const handleStrategySelect = useCallback((strategy: TradingStrategy | null) => {
    logger.info('BacktestRunnerPage: Strategy selected', strategy?.name || 'None');
    setSelectedStrategy(strategy);
    setBacktestResult(null); // Clear previous results
    setError(null); // Clear previous errors
    setAiChosenStrategyInfo(null); // Clear AI choice info when strategy changes
    setAiChoiceError(null); // Clear AI choice error

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
    setAiChosenStrategyInfo(null); // Clear AI choice info if symbol/settings change
    setAiChoiceError(null);
    logger.debug('BacktestRunnerPage: Backtest settings changed', settings);
  }, []);

  // Effect to fetch AI chosen strategy when 'ai-selector' is chosen and symbol is available
  useEffect(() => {
    if (selectedStrategy?.id === 'ai-selector' && currentBacktestSettings.symbol) {
      const fetchAIChoice = async () => {
        setIsFetchingAIChoice(true);
        setAiChosenStrategyInfo(null);
        setAiChoiceError(null);
        try {
          logger.info(`BacktestRunnerPage: Fetching AI choice for symbol ${currentBacktestSettings.symbol}`);
          const data = await getAICurrentStrategy(currentBacktestSettings.symbol);
          setAiChosenStrategyInfo(data);
          logger.info('BacktestRunnerPage: AI choice fetched successfully', data);
        } catch (err: any) {
          const errorMessage = err.message || 'Failed to fetch AI strategy choice.';
          setAiChoiceError(errorMessage);
          logger.error('BacktestRunnerPage: Error fetching AI choice', err);
        } finally {
          setIsFetchingAIChoice(false);
        }
      };
      fetchAIChoice();
    } else {
      // If not ai-selector or no symbol, clear any previous AI choice info
      setAiChosenStrategyInfo(null);
      setAiChoiceError(null);
      setIsFetchingAIChoice(false);
    }
  }, [selectedStrategy, currentBacktestSettings.symbol]);


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

  // Handler for the new "Get Strategy Suggestion" button
  const handleGetSuggestion = async () => {
    if (!currentBacktestSettings.symbol) {
      setSuggestionError("Please select a symbol first.");
      logger.warn('[GetSuggestion] No symbol selected.');
      return;
    }
    if (initialCapitalForSuggestion <= 0) {
      setSuggestionError("Please enter a positive initial capital for suggestion.");
      logger.warn('[GetSuggestion] Invalid initial capital for suggestion.');
      return;
    }

    setIsFetchingSuggestion(true);
    setSuggestionResult(null);
    setSuggestionError(null);
    logger.info(`[GetSuggestion] Fetching suggestion for ${currentBacktestSettings.symbol} with capital ${initialCapitalForSuggestion}`);

    try {
      const result = await fetchStrategySuggestion(
        currentBacktestSettings.symbol,
        initialCapitalForSuggestion
        // TODO: Optionally pass preferredLookback, preferredMetric, preferredOptimizeParams
        // if UI controls are added for them for the suggestion feature.
      );
      setSuggestionResult(result);
      if (!result.suggestedStrategyId) {
        logger.info(`[BacktestRunnerPage] Suggestion API returned successfully but no specific strategy chosen: ${result.message}`);
        // Optional: setSuggestionError(result.message); // Or let the display handle the message from result
      } else {
        logger.info('[GetSuggestion] Suggestion received:', result);
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch strategy suggestion.';
      setSuggestionError(errorMessage);
      logger.error('[GetSuggestion] Error fetching suggestion:', err);
    } finally {
      setIsFetchingSuggestion(false);
    }
  };

  // Handler for "Apply & Run Backtest with Suggestion"
  const handleApplyAndRunSuggestion = async () => {
    if (!suggestionResult || !suggestionResult.suggestedStrategyId || !suggestionResult.suggestedParameters) {
      setError("Aucune suggestion valide à appliquer pour le backtest."); // French
      logger.warn('[ApplyAndRun] No valid suggestion to apply.');
      return;
    }

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Default 90 days ago

    const requestBody = {
      strategyId: suggestionResult.suggestedStrategyId,
      strategyParams: suggestionResult.suggestedParameters,
      symbol: currentBacktestSettings.symbol, // From existing form state
      startDate: startDate,
      endDate: endDate,
      initialCash: initialCapitalForSuggestion, // Use the capital from the suggestion input
      sourceApi: 'Binance', // Default for suggested run
      interval: '1d',       // Default for suggested run
    };

    logger.info('[ApplyAndRun] Running backtest with suggested settings:', requestBody);
    setIsLoading(true); // Main loading indicator
    setBacktestResult(null);
    setError(null); // Main error display

    try {
      const response = await axios.post<BacktestResult>('/api/backtest', requestBody);
      setBacktestResult(response.data);
      logger.info('[ApplyAndRun] Backtest with suggestion successful:', response.data);
    } catch (err) {
      const axiosError = err as AxiosError<ApiError>;
      const errorMessage = axiosError.response?.data?.message || axiosError.message || 'An unknown error occurred.';
      setError(errorMessage); // Main error display
      logger.error('[ApplyAndRun] Backtest with suggestion failed:', axiosError);
    } finally {
      setIsLoading(false); // Main loading indicator
    }
  };

  // Handler for "Appliquer aux Paramètres"
  const handleApplySuggestionToConfig = () => {
    if (!suggestionResult || !suggestionResult.suggestedStrategyId || !suggestionResult.suggestedParameters) {
      setSuggestionError("Aucune suggestion valide à appliquer."); // French
      logger.warn('[ApplyToConfig] No valid suggestion to apply.');
      return;
    }

    const strategyToApply = availableStrategies.find(s => s.id === suggestionResult.suggestedStrategyId);
    if (!strategyToApply) {
      logger.error(`[ApplyToConfig] Suggested strategy ID '${suggestionResult.suggestedStrategyId}' not found in available strategies list.`);
      setSuggestionError("Erreur : La stratégie suggérée est introuvable dans la liste des stratégies disponibles."); // French
      return;
    }

    // Update main form states
    // Calling handleStrategySelect will also reset params to defaults, so call setCurrentStrategyParams after.
    handleStrategySelect(strategyToApply); // This calls setSelectedStrategy and sets default params
    setCurrentStrategyParams(suggestionResult.suggestedParameters); // Override with suggested params

    setCurrentBacktestSettings(prevSettings => ({
      ...prevSettings,
      initialCash: initialCapitalForSuggestion, // Use capital from suggestion input
      // Keep other settings like symbol, dates, interval, sourceApi from the main form
    }));

    // Clear previous backtest results and errors as settings have changed
    setBacktestResult(null);
    setError(null);
    // Provide user feedback
    // Consider a more subtle notification system for this in the future.
    // For now, reusing suggestionError to display a success/info message.
    setSuggestionError("Suggestion appliquée aux formulaires de configuration principaux. Veuillez vérifier et lancer le backtest manuellement."); // French
    logger.info(`[ApplyToConfig] Applied suggestion: Strategy '${strategyToApply.name}', Params:`, suggestionResult.suggestedParameters, `InitialCash: ${initialCapitalForSuggestion}`);
  };


  return (
    <div className="backtest-runner-page">
      <h2>Backtest Configuration</h2>

      {/* Section for Smart Strategy Suggestion */}
      <div className="backtest-section suggestion-section">
        <h4>Suggestion de Stratégie Intelligente</h4>
        <div className="form-group">
          <label htmlFor="initialCapitalForSuggestion">Capital Initial pour Suggestion :</label>
          <input
            type="number"
            id="initialCapitalForSuggestion"
            name="initialCapitalForSuggestion"
            value={initialCapitalForSuggestion}
            onChange={(e) => setInitialCapitalForSuggestion(parseFloat(e.target.value) || 0)}
            min="1"
          />
        </div>
        <button onClick={handleGetSuggestion} disabled={isFetchingSuggestion || !currentBacktestSettings.symbol}>
          {isFetchingSuggestion ? 'Recherche de suggestion en cours...' : 'Obtenir une Suggestion de Stratégie'}
        </button>

        {isFetchingSuggestion && <p>Recherche de suggestion en cours...</p>}
        {suggestionError && <p className="error-message" style={{ marginTop: '10px' }}>Erreur de suggestion : {suggestionError}</p>}
        {suggestionResult && !isFetchingSuggestion && (
          <div className="suggestion-result info-box-styled" style={{ marginTop: '10px' }}>
            <p><strong>Détails de la Suggestion :</strong></p>
            {/* Display backend message first, as it might explain why no strategy was chosen */}
            <p>{suggestionResult.message}</p>

            {suggestionResult.suggestedStrategyId && suggestionResult.suggestedStrategyName && (
              <>
                <p>Stratégie Suggérée : <strong>{suggestionResult.suggestedStrategyName}</strong> (ID: {suggestionResult.suggestedStrategyId})</p>

                {suggestionResult.recentPriceUsed !== undefined && suggestionResult.recentPriceUsed !== null && (
                  <p style={{ fontStyle: 'italic', fontSize: '0.9em' }}>
                    Basé sur votre capital de {initialCapitalForSuggestion.toLocaleString()}€ et un prix récent de {suggestionResult.recentPriceUsed.toFixed(2)} pour {currentBacktestSettings.symbol}, le paramètre de taille de transaction (ex: 'tradeAmount') a été ajusté.
                  </p>
                )}

                {suggestionResult.suggestedParameters && Object.keys(suggestionResult.suggestedParameters).length > 0 && (
                  <div>
                    <p>Paramètres Suggérés :</p>
                    <ul>
                      {Object.entries(suggestionResult.suggestedParameters).map(([key, value]) => (
                        <li key={key}><code>{key}</code>: {String(value)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button onClick={handleApplyAndRunSuggestion} disabled={isLoading} style={{ marginTop: '10px' }}>
                  Appliquer et Lancer le Backtest avec la Suggestion
                </button>
                <button onClick={handleApplySuggestionToConfig} disabled={!suggestionResult || !suggestionResult.suggestedStrategyId} style={{ marginTop: '10px', marginLeft: '10px' }}>
                  Appliquer aux Paramètres
                </button>
              </>
            )}
          </div>
        )}
      </div>
      
      <div className="backtest-section config-section">
        <StrategySelector
          strategies={availableStrategies} // Pass fetched strategies to selector
          onStrategySelect={handleStrategySelect}
        />
        <StrategyParameterForm 
          strategy={selectedStrategy} 
          onParamsChange={handleParamsChange}
          initialParams={currentStrategyParams}
        />
        {/* Display AI Chosen Strategy Info */}
        {selectedStrategy?.id === 'ai-selector' && (
          <div className="ai-choice-info info-box-styled">
            {isFetchingAIChoice && <p>Fetching AI choice for {currentBacktestSettings.symbol}...</p>}
            {aiChoiceError && <p style={{ color: 'red' }}>Error: {aiChoiceError}</p>}
            {aiChosenStrategyInfo && !isFetchingAIChoice && !aiChoiceError && (
              <div>
                <p><strong>AI Selector Information for {currentBacktestSettings.symbol || "N/A"}:</strong></p>
                {aiChosenStrategyInfo.chosenStrategyName ? (
                  <p>Recommended Strategy: <strong>{aiChosenStrategyInfo.chosenStrategyName}</strong> (ID: {aiChosenStrategyInfo.chosenStrategyId})</p>
                ) : (
                  // This part might be redundant if aiState.message covers it, but good as a fallback.
                  <p>{aiChosenStrategyInfo.message || "No strategy recommendation available."}</p> 
                )}

                {/* Display Chosen Parameters */}
                {aiChosenStrategyInfo.chosenParameters && Object.keys(aiChosenStrategyInfo.chosenParameters).length > 0 && (
                  <div style={{ marginTop: '8px', paddingLeft: '15px' }}>
                    <p style={{ fontWeight: '600', marginBottom: '4px' }}>Using Parameters:</p>
                    <ul style={{ listStyleType: 'disc', paddingLeft: '20px', margin: '0' }}>
                      {Object.entries(aiChosenStrategyInfo.chosenParameters).map(([key, value]) => (
                        <li key={key} style={{ fontSize: '0.9em' }}>
                          <code>{key}</code>: {String(value)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Display the main message from backend, which might confirm optimization status */}
                {aiChosenStrategyInfo.message && (
                    <p style={{ marginTop: '8px', fontStyle: 'italic', fontSize: '0.9em' }}>{aiChosenStrategyInfo.message}</p>
                )}
              </div>
            )}
            {!isFetchingAIChoice && !aiChoiceError && !aiChosenStrategyInfo && currentBacktestSettings.symbol && (
                 <p><em>No specific recommendation available, or still initializing for {currentBacktestSettings.symbol}.</em></p>
            )}
            {!isFetchingAIChoice && !aiChoiceError && !aiChosenStrategyInfo && !currentBacktestSettings.symbol && (
              <p><em>Enter a symbol to see AI's recommendation.</em></p>
            )}
          </div>
        )}
      </div>
      
      <div className="backtest-section settings-section">
        <BacktestSettingsForm 
          onSettingsChange={handleSettingsChange} 
          initialSettings={currentBacktestSettings}
        />
      </div>
      
      <button 
        onClick={handleRunBacktest} 
        disabled={isLoading || !selectedStrategy || isFetchingAIChoice}
        className="run-backtest-button" // Added class for potential specific styling
      >
        {isLoading ? 'Running...' : 'Run Backtest'}
      </button>
      
      <div className="results-section"> {/* No backtest-section class for results unless desired */}
        <ResultsDisplay results={backtestResult} error={error} loading={isLoading} />
        
        {/* Render charts if results are available */}
        {backtestResult && !error && (
          <div className="charts-section"> {/* Removed inline style, rely on App.css */}
            {/* Equity Chart */}
            {backtestResult.portfolioHistory && backtestResult.portfolioHistory.length > 0 && (
              <div className="chart-container">
                <h4 className="chart-title">Portfolio Equity</h4>
                <EquityChart 
                  data={backtestResult.portfolioHistory} 
                />
              </div>
            )}

            {/* Trades on Price Chart */}
            {backtestResult.historicalDataUsed && backtestResult.historicalDataUsed.length > 0 && backtestResult.trades && (
              <div className="chart-container">
                <h4 className="chart-title">Price Chart & Trades</h4>
                <TradesOnPriceChart 
                  priceData={backtestResult.historicalDataUsed as ReadonlyArray<FrontendHistoricalDataPoint>} 
                  tradesData={backtestResult.trades.map((trade: Trade) => ({ 
                    timestamp: trade.timestamp, 
                    date: trade.date, // Ensure this is string as expected by FrontendTrade
                    action: trade.action,
                    price: trade.price,
                    sharesTraded: trade.sharesTraded,
                    cashAfterTrade: trade.cashAfterTrade
                  }))}
                  aiDecisionLog={backtestResult.aiDecisionLog} // Pass the AI decision log
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BacktestRunnerPage;
