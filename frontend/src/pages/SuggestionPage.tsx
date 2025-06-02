// frontend/src/pages/SuggestionPage.tsx
import React, { useState, useCallback } from 'react';
import axios, { AxiosError } from 'axios'; // Added axios, AxiosError
import { fetchStrategySuggestion } from '../services/api'; 
import { 
    MultipleSuggestionsApiResponse, 
    SuggestionResponse, 
    BacktestResult, // Added BacktestResult
    ApiError      // Added ApiError
} from '../types'; 
import './SuggestionPage.css';

type SuggestionFlowStep = 'form' | 'loading' | 'suggestions' | 'result';

const SuggestionPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<SuggestionFlowStep>('form');
  const [initialCapital, setInitialCapital] = useState<number>(10000);
  const [riskPercentage, setRiskPercentage] = useState<number>(2); 
  
  const [suggestionsResult, setSuggestionsResult] = useState<MultipleSuggestionsApiResponse | null>(null);
  const [selectedSuggestionForBacktest, setSelectedSuggestionForBacktest] = useState<SuggestionResponse | null>(null);
  
  // State for backtest results
  const [backtestRunResult, setBacktestRunResult] = useState<BacktestResult | null>(null);
  const [isBacktestLoading, setIsBacktestLoading] = useState<boolean>(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null); // General error for suggestion fetching

  const handleLaunchSuggestion = async () => {
    setError(null);
    if (initialCapital <= 0) {
      setError("Le capital initial doit être positif.");
      return;
    }
    if (riskPercentage <= 0 || riskPercentage > 100) {
      setError("Le pourcentage de risque doit être compris entre 1 et 100.");
      return;
    }

    setCurrentStep('loading');
    setSuggestionsResult(null); 
    setSelectedSuggestionForBacktest(null);
    setBacktestRunResult(null); // Clear previous backtest results
    setBacktestError(null);     // Clear previous backtest errors


    try {
      const result = await fetchStrategySuggestion(
        '', 
        initialCapital,
        undefined, 
        undefined, 
        undefined, 
        riskPercentage,
        undefined  
      );
      setSuggestionsResult(result);
      if (result.suggestions && result.suggestions.length > 0) {
        setCurrentStep('suggestions');
      } else {
        setCurrentStep('suggestions'); 
      }
    } catch (err: any) {
      setError(err.message || "Erreur lors de la récupération des suggestions.");
      setCurrentStep('form'); 
    }
  };

  const handleChooseSuggestion = async (suggestion: SuggestionResponse) => {
    setSelectedSuggestionForBacktest(suggestion);
    setIsBacktestLoading(true);
    setBacktestError(null);
    setBacktestRunResult(null);
    setCurrentStep('result'); // Show result section, which will initially show loading

    try {
      const { suggestedStrategyId, suggestedParameters, symbol } = suggestion;
      if (!suggestedStrategyId || !suggestedParameters || !symbol) {
        // Symbol is now expected from the suggestion object itself
        setBacktestError("Les détails de la suggestion sont incomplets (ID, paramètres ou symbole manquants).");
        setIsBacktestLoading(false);
        return;
      }

      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const backtestRequestBody = {
        strategyId: suggestedStrategyId,
        strategyParams: suggestedParameters,
        symbol: symbol, 
        startDate: startDate,
        endDate: endDate,
        initialCash: initialCapital, 
        sourceApi: 'Binance', 
        interval: '1d',       
      };

      const response = await axios.post<BacktestResult>('/api/backtest', backtestRequestBody);
      setBacktestRunResult(response.data);

    } catch (err: any) {
      const axiosError = err as AxiosError<ApiError>;
      const errorMessage = axiosError.response?.data?.message || axiosError.message || 'An unknown error occurred during backtest.';
      setBacktestError(errorMessage);
    } finally {
      setIsBacktestLoading(false);
    }
  };

  const renderForm = () => (
    <div className="suggestion-form-container">
      <div>
        <label htmlFor="initialCapital">Capital Initial (€):</label>
        <input
          type="number"
          id="initialCapital"
          value={initialCapital}
          onChange={(e) => setInitialCapital(parseFloat(e.target.value) || 0)}
          min="1"
        />
      </div>
      <div>
        <label htmlFor="riskPercentage">Pourcentage du capital par transaction (%):</label>
        <input
          type="number"
          id="riskPercentage"
          value={riskPercentage}
          onChange={(e) => setRiskPercentage(parseFloat(e.target.value) || 0)}
          min="1"
          max="100"
        />
      </div>
      <button onClick={handleLaunchSuggestion} disabled={currentStep === 'loading'}>
        {currentStep === 'loading' ? 'Chargement...' : 'Lancer la suggestion 🚀'}
      </button>
      {error && <p className="error-message">{error}</p>}
    </div>
  );

  const renderSuggestions = () => {
    if (!suggestionsResult) return null;

    return (
      <div className="suggestions-display-container">
        <h2>Suggestions Reçues</h2>
        {suggestionsResult.message && <p><em>{suggestionsResult.message}</em></p>}

        {suggestionsResult.suggestions && suggestionsResult.suggestions.length > 0 ? (
          <div className="suggestions-list-container">
            {suggestionsResult.suggestions.map((suggestion, index) => (
              <div key={index} className="suggestion-card">
                <h4>Suggestion Option {index + 1}</h4>
                <p><strong>Stratégie :</strong> {suggestion.suggestedStrategyName} (ID: {suggestion.suggestedStrategyId})</p>
                {suggestion.symbol && <p><strong>Symbole :</strong> {suggestion.symbol}</p>}
                {suggestion.evaluationMetricUsed && typeof suggestion.evaluationScore === 'number' && (
                  <p><strong>Performance ({suggestion.evaluationMetricUsed}) :</strong> {suggestion.evaluationScore.toFixed(4)}</p>
                )}
                <p><strong>Nombre de trades simulés :</strong> N/A (donnée non disponible)</p>
                <p><strong>Risque max / trade :</strong> {(initialCapital * riskPercentage / 100).toFixed(2)} €</p>
                
                {suggestion.suggestedParameters && Object.keys(suggestion.suggestedParameters).length > 0 && (
                  <div>
                    <p><strong>Paramètres Suggérés :</strong></p>
                    <ul style={{ listStyleType: 'disc', paddingLeft: '20px', fontSize: '0.9em' }}>
                      {Object.entries(suggestion.suggestedParameters).map(([key, value]) => (
                        <li key={key}><code>{key}</code>: {String(value)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {suggestion.message && <p style={{ fontStyle: 'italic', fontSize: '0.9em', marginTop: '10px' }}>Note: {suggestion.message}</p>}
                <button onClick={() => handleChooseSuggestion(suggestion)}>
                  Choisir et Backtester cette suggestion
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p>Aucune suggestion spécifique n'a pu être générée avec ces critères.</p>
        )}
        <button onClick={() => setCurrentStep('form')}>Retour au Formulaire</button>
      </div>
    );
  };
  
  const renderBacktestResult = () => (
     <div className="backtest-result-container">
         <h3>
             Résultat du Backtest pour : {selectedSuggestionForBacktest?.suggestedStrategyName} 
             {selectedSuggestionForBacktest?.symbol && ` (${selectedSuggestionForBacktest.symbol})`}
         </h3>
         {isBacktestLoading && <p>Chargement du résultat du backtest...</p>}
         {backtestError && <p className="error-message">Erreur du backtest : {backtestError}</p>}
         {!isBacktestLoading && !backtestError && backtestRunResult && (
           <div>
             <p><span className="kpi-label">Valeur finale du portefeuille :</span> {backtestRunResult.finalPortfolioValue?.toFixed(2)} €</p>
             <p><span className="kpi-label">Profit/Perte Total :</span> {backtestRunResult.totalProfitOrLoss?.toFixed(2)} €</p>
             <p><span className="kpi-label">Pourcentage Profit/Perte :</span> {backtestRunResult.profitOrLossPercentage?.toFixed(2)}%</p>
             <p><span className="kpi-label">Nombre total de trades :</span> {backtestRunResult.totalTrades}</p>
             
             {/* Assuming sharpeRatio and maxDrawdown might exist on BacktestResult type based on common practice */}
             {/* If not, they will just not render or render as undefined. Add them to types.ts if they become available. */}
             {typeof backtestRunResult.sharpeRatio === 'number' && 
                <p><span className="kpi-label">Ratio de Sharpe :</span> {backtestRunResult.sharpeRatio.toFixed(3)}</p>}
             {typeof backtestRunResult.maxDrawdown === 'number' && 
                <p><span className="kpi-label">Max Drawdown :</span> {(backtestRunResult.maxDrawdown * 100).toFixed(2)}%</p>}

             <p><span className="kpi-label">CAGR :</span> N/A</p>
             <p><span className="kpi-label">Trades Gagnants (%) :</span> N/A</p>
           </div>
         )}
         <button onClick={() => setCurrentStep('suggestions')}>Retour aux Suggestions</button>
         <button onClick={() => { 
             setCurrentStep('form'); 
             setSuggestionsResult(null); 
             setSelectedSuggestionForBacktest(null); 
             setBacktestRunResult(null); 
             setBacktestError(null);
             setError(null); // Also clear general suggestion error
         }}>Retour au Formulaire Initial</button>
     </div>
  );

  return (
    <div className="suggestion-page-container">
      <h2>Suggestions de Stratégie</h2>
      <p>Cette page vous aidera à obtenir des suggestions de stratégies de trading basées sur votre capital et votre profil de risque.</p>
      
      {currentStep === 'form' && renderForm()}
      {currentStep === 'loading' && <p>Chargement des suggestions...</p>}
      {currentStep === 'suggestions' && suggestionsResult && renderSuggestions()}
      {currentStep === 'result' && renderBacktestResult()}
    </div>
  );
};

export default SuggestionPage;
