// frontend/src/pages/SuggestionPage.tsx
import React, { useState } from 'react'; 
import axios from 'axios'; 
import type { AxiosError } from 'axios'; 
import { fetchStrategySuggestion } from '../services/api'; 
import type { 
    MultipleSuggestionsApiResponse, 
    SuggestionResponse, 
    BacktestResult, 
    ApiError,
    HistoricalDataPoint, 
    Trade             
} from '../types'; 
import './SuggestionPage.css';
import EquityChart from '../components/EquityChart'; 
import TradesOnPriceChart from '../components/TradesOnPriceChart'; 

// Mappings for Thematic Names and Strategy Types
const G_THEMATIC_SUGGESTION_NAMES: string[] = ["L'Écureuil Prudent 🐿️", "Le Hérisson Équilibré 🦔", "Le Faucon Audacieux 🦅"];

const G_STRATEGY_DISPLAY_NAMES: Record<string, string> = {
  'ichimoku-cloud': 'Ichimoku Cloud',
  'simple-threshold': 'Seuils Simples',
  'rsi-bollinger': 'RSI + Bandes de Bollinger',
  'macd-crossover': 'Croisement MACD',
  'ai-price-prediction': 'Prédiction par IA (Exp.)',
  'dual-sma-crossover': 'Croisement Double Moyenne Mobile', 
  'dynamic-support-resistance': 'Support/Résistance Dynamique', 
};


type SuggestionFlowStep = 'form' | 'loading' | 'suggestions' | 'result';

const SuggestionPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<SuggestionFlowStep>('form');
  const [initialCapital, setInitialCapital] = useState<number>(10000);
  const [riskPercentage, setRiskPercentage] = useState<number>(2); 
  
  const [suggestionsResult, setSuggestionsResult] = useState<MultipleSuggestionsApiResponse | null>(null);
  const [selectedSuggestionForBacktest, setSelectedSuggestionForBacktest] = useState<SuggestionResponse | null>(null);
  
  const [backtestRunResult, setBacktestRunResult] = useState<BacktestResult | null>(null);
  const [isBacktestLoading, setIsBacktestLoading] = useState<boolean>(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null); 

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
    setBacktestRunResult(null); 
    setBacktestError(null);     


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
    setCurrentStep('result'); 

    try {
      const { suggestedStrategyId, suggestedParameters, symbol } = suggestion;
      if (!suggestedStrategyId || !suggestedParameters || !symbol) {
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
            {suggestionsResult.suggestions.map((suggestion, index) => {
              const thematicName = G_THEMATIC_SUGGESTION_NAMES[index] || `Suggestion Option ${index + 1}`;
              const strategyDisplayName = G_STRATEGY_DISPLAY_NAMES[suggestion.suggestedStrategyId || ''] || suggestion.suggestedStrategyId;
              const riskMaxPerTrade = (initialCapital * riskPercentage / 100).toFixed(2);
              const buttonText = `Choisir et Backtester ${G_THEMATIC_SUGGESTION_NAMES[index] ? G_THEMATIC_SUGGESTION_NAMES[index].split(' ')[1] : `Option ${index + 1}`}`;

              return (
                <div key={index} className="suggestion-card">
                  <h4>
                    {thematicName} {suggestion.symbol && `- ${suggestion.symbol}`}
                    <span className="tooltip-trigger"> ℹ️
                      <span className="tooltip-text">
                        {index === 0 ? "Cette approche de trading vise des gains potentiellement plus modestes mais avec une prise de risque généralement considérée comme plus faible. Idéal pour une croissance régulière." :
                         index === 1 ? "Une stratégie cherchant un équilibre entre risque et rendement, visant une performance solide sans exposition excessive." :
                         "Approche plus dynamique visant des rendements potentiellement plus élevés, ce qui peut impliquer une prise de risque plus conséquente."}
                      </span>
                    </span>
                  </h4>
                  <p>
                    <strong>Type de Stratégie:</strong> {strategyDisplayName}
                    <span className="tooltip-trigger"> ℹ️
                      <span className="tooltip-text">
                        {suggestion.suggestedStrategyId === 'ichimoku-cloud' ? "Stratégie de suivi de tendance qui utilise plusieurs lignes et un 'nuage' (Kumo) pour identifier la direction du marché, les niveaux de support/résistance et générer des signaux." :
                         suggestion.suggestedStrategyId === 'simple-threshold' ? "Achète lorsque le prix dépasse un seuil haut et vend lorsqu'il passe sous un seuil bas." :
                         suggestion.suggestedStrategyId === 'rsi-bollinger' ? "Combine l'indicateur de momentum RSI (pour surachat/survente) avec les Bandes de Bollinger (volatilité et niveaux de prix relatifs)." :
                         suggestion.suggestedStrategyId === 'macd-crossover' ? "Utilise les croisements de la ligne MACD et de sa ligne de signal pour indiquer des changements potentiels de momentum et de tendance." :
                         suggestion.suggestedStrategyId === 'ai-price-prediction' ? "Stratégie expérimentale utilisant un modèle d'apprentissage machine pour tenter de prédire les mouvements de prix futurs." :
                         "Description non disponible."}
                      </span>
                    </span>
                    {suggestion.suggestedStrategyId && <small> (ID: {suggestion.suggestedStrategyId})</small>}
                  </p>
                  <p>
                    <strong>Performance Estimée ({suggestion.evaluationMetricUsed || 'N/A'}):</strong> 
                    {typeof suggestion.evaluationScore === 'number' ? suggestion.evaluationScore.toFixed(2) : 'N/A'}
                    <span className="tooltip-trigger"> ℹ️
                      <span className="tooltip-text">
                        {suggestion.evaluationMetricUsed === 'pnl' ? "Profit et Perte (P&L) net simulé par la stratégie sur la période d'évaluation interne de l'IA. Un score plus élevé indique une meilleure performance brute." :
                         suggestion.evaluationMetricUsed === 'sharpe' ? "Ratio de Sharpe simulé sur la période d'évaluation interne de l'IA. Mesure le rendement ajusté au risque (un ratio > 1 est généralement bon)." :
                         suggestion.evaluationMetricUsed === 'winRate' ? "Pourcentage de trades gagnants simulé sur la période d'évaluation interne de l'IA." :
                         "Cette métrique indique la performance de la stratégie lors de son évaluation par l'IA."}
                      </span>
                    </span>
                    <small style={{display: 'block', fontSize: '0.8em', fontStyle: 'italic'}}>(Note: Score basé sur l'évaluation IA, pas un ROI direct.)</small>
                  </p>
                  <p><strong>Nombre de trades simulés:</strong> N/A (donnée non disponible)</p>
                  <p>
                    <strong>Risque max / trade:</strong> {riskMaxPerTrade} €
                    <span className="tooltip-trigger"> ℹ️
                      <span className="tooltip-text">
                        Montant maximum en euros que cette configuration de stratégie risquerait sur une seule transaction, calculé sur la base de votre 'Capital Initial' et du 'Pourcentage du capital par transaction' que vous avez fournis.
                      </span>
                    </span>
                  </p>
                  
                  {suggestion.suggestedParameters && Object.keys(suggestion.suggestedParameters).length > 0 && (
                    <div>
                      <strong>Paramètres Suggérés Clés:</strong>
                      <ul style={{ listStyleType: 'disc', paddingLeft: '20px', fontSize: '0.9em' }}>
                        {Object.entries(suggestion.suggestedParameters).map(([key, value]) => (
                          <li key={key}><code>{key}</code>: {String(value)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {suggestion.message && <p style={{fontSize: '0.9em', color: '#555', marginTop: '10px'}}><em>Note interne: {suggestion.message}</em></p>}
                  <button onClick={() => handleChooseSuggestion(suggestion)}>
                    {buttonText}
                  </button>
                </div>
              );
            })}
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
            Résultats du Backtest pour : {selectedSuggestionForBacktest?.suggestedStrategyName} 
            {selectedSuggestionForBacktest?.symbol && ` (${selectedSuggestionForBacktest.symbol})`}
        </h3>
        {isBacktestLoading && <p>Chargement du résultat du backtest...</p>}
        {backtestError && <p className="error-message">Erreur du backtest : {backtestError}</p>}
        
        {!isBacktestLoading && !backtestError && backtestRunResult && (
          <>
            <div className="kpi-grid">
              <p><span className="kpi-label">Valeur Initiale du Portefeuille:</span> {backtestRunResult.initialPortfolioValue?.toFixed(2)} €</p>
              <p>
                <span className="kpi-label">Valeur Finale du Portefeuille:</span> {backtestRunResult.finalPortfolioValue?.toFixed(2)} €
                <span className="tooltip-trigger"> ℹ️
                  <span className="tooltip-text">La valeur totale de votre portefeuille (capital + profits/pertes latents et réalisés) à la fin de la période de simulation du backtest.</span>
                </span>
              </p>
              <p>
                <span className="kpi-label">Profit/Perte Total:</span> {backtestRunResult.totalProfitOrLoss?.toFixed(2)} €
                <span className="tooltip-trigger"> ℹ️
                  <span className="tooltip-text">Le gain ou la perte net(te) en euros réalisé(e) par la stratégie sur l'ensemble de la période de backtest, par rapport à votre capital initial.</span>
                </span>
              </p>
              <p>
                <span className="kpi-label">Pourcentage Profit/Perte:</span> {backtestRunResult.profitOrLossPercentage?.toFixed(2)} %
                <span className="tooltip-trigger"> ℹ️
                  <span className="tooltip-text">Le gain ou la perte total(e) exprimé(e) en pourcentage de votre capital initial.</span>
                </span>
              </p>
              <p>
                <span className="kpi-label">Nombre Total de Trades:</span> {backtestRunResult.totalTrades}
                <span className="tooltip-trigger"> ℹ️
                  <span className="tooltip-text">Le nombre total de transactions (achats ou ventes pour ouvrir/clôturer une position) exécutées par la stratégie pendant la période de backtest.</span>
                </span>
              </p>
              <p>
                <span className="kpi-label">Ratio de Sharpe:</span> {(backtestRunResult.sharpeRatio !== undefined ? backtestRunResult.sharpeRatio.toFixed(3) : 'N/A')}
                <span className="tooltip-trigger"> ℹ️
                  <span className="tooltip-text">Mesure la performance d'un investissement par rapport à un actif sans risque, après ajustement pour son risque. Un ratio plus élevé indique une meilleure performance pour la quantité de risque prise (généralement &gt; 1 est considéré comme bon, &gt; 2 très bon).</span>
                </span>
              </p>
              <p>
                <span className="kpi-label">Max Drawdown:</span> {(backtestRunResult.maxDrawdown !== undefined ? (backtestRunResult.maxDrawdown * 100).toFixed(2) + ' %' : 'N/A')}
                <span className="tooltip-trigger"> ℹ️
                  <span className="tooltip-text">La plus grande perte en pourcentage enregistrée depuis un pic de valeur du portefeuille jusqu'à un creux subséquent, avant qu'un nouveau pic ne soit atteint. Indique le risque de perte maximal sur la période.</span>
                </span>
              </p>
              <p>
                <span className="kpi-label">CAGR (annualisé):</span> {(backtestRunResult.CAGR !== undefined ? backtestRunResult.CAGR.toFixed(2) + ' %' : 'N/A')}
                <span className="tooltip-trigger"> ℹ️
                  <span className="tooltip-text">Taux de Croissance Annuel Composé (Compound Annual Growth Rate). C'est le taux de rendement annuel moyen géométrique sur la période de simulation, si elle durait un an. (Actuellement N/A si non fourni par le backend).</span>
                </span>
              </p>
              <p>
                <span className="kpi-label">Pourcentage de Trades Gagnants:</span> {(backtestRunResult.winningTradesPercentage !== undefined ? backtestRunResult.winningTradesPercentage.toFixed(2) + ' %' : 'N/A')}
                <span className="tooltip-trigger"> ℹ️
                  <span className="tooltip-text">Le pourcentage de toutes les transactions effectuées qui ont été clôturées avec un profit. (Actuellement N/A si non fourni par le backend).</span>
                </span>
              </p>
            </div>

            <div className="charts-section">
              {backtestRunResult.portfolioHistory && backtestRunResult.portfolioHistory.length > 0 && (
                <div className="chart-container">
                  <h4>Évolution du Portefeuille</h4>
                  <EquityChart data={backtestRunResult.portfolioHistory} />
                </div>
              )}

              {backtestRunResult.historicalDataUsed && backtestRunResult.historicalDataUsed.length > 0 && backtestRunResult.trades && (
                <div className="chart-container">
                  <h4>Prix et Transactions</h4>
                  <TradesOnPriceChart 
                    priceData={backtestRunResult.historicalDataUsed as ReadonlyArray<HistoricalDataPoint>} 
                    tradesData={backtestRunResult.trades as ReadonlyArray<Trade>}
                    aiDecisionLog={backtestRunResult.aiDecisionLog} 
                  />
                </div>
              )}
            </div>
          </>
        )}

        {!isBacktestLoading && ( 
          <div style={{marginTop: '20px'}}> 
            <button onClick={() => setCurrentStep('suggestions')}>Retour aux Suggestions</button>
            <button onClick={() => { 
                setCurrentStep('form'); 
                setSuggestionsResult(null); 
                setSelectedSuggestionForBacktest(null); 
                setBacktestRunResult(null); 
                setBacktestError(null);
                setError(null); 
            }}>Retour au Formulaire Initial</button>
          </div>
        )}
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
