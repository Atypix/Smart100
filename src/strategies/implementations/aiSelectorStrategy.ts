import { TradingStrategy, StrategyContext, StrategySignal, StrategyParameterDefinition } from '../strategy.types';
import { StrategyManager } from '../strategyManager';
import { logger } from '../../utils/logger';
import { Portfolio } from '../../portfolio/portfolio'; // Assuming this path
import { Trade } from '../../portfolio/trade'; // Assuming this path
// TechnicalIndicators might not be directly needed if strategies encapsulate their own indicator use.

interface AISelectorStrategyParams {
  evaluationLookbackPeriod: number;
  candidateStrategyIds?: string[];
  evaluationMetric?: 'pnl' | 'sharpe' | 'winRate' | string; // Allow string for flexibility, but guide with specific types
}

export const aiSelectorStrategy: TradingStrategy<AISelectorStrategyParams> = {
  id: "ai-selector",
  name: "AI Strategy Selector",
  description: "A meta-strategy that dynamically selects and executes an underlying trading strategy based on recent performance.",
  parameters: {
    evaluationLookbackPeriod: {
      type: 'number',
      defaultValue: 30,
      min: 5,
      max: 200,
      label: 'Evaluation Lookback Period',
      description: 'Number of recent data points to evaluate candidate strategies.',
    },
    candidateStrategyIds: {
      type: 'string', // Will be comma-separated in UI, then parsed
      defaultValue: "",
      label: "Candidate Strategy IDs (comma-separated)",
      description: "Optional. A comma-separated list of strategy IDs to consider. If empty, all available strategies (excluding self) will be candidates.",
    },
    evaluationMetric: {
      type: 'string',
      defaultValue: 'pnl',
      label: 'Evaluation Metric for AI Selection',
      description: "Metric to evaluate candidate strategies. Options: 'pnl' (Profit/Loss), 'sharpe' (Sharpe Ratio), 'winRate' (Win Rate).",
      options: [
        { value: 'pnl', label: 'Profit/Loss' },
        { value: 'sharpe', label: 'Sharpe Ratio (placeholder)' }, // Mark as placeholder if not implemented
        { value: 'winRate', label: 'Win Rate (placeholder)' }, // Mark as placeholder if not implemented
      ],
    },
  },

  // Static cache to store symbol -> chosenStrategyId
  // This needs to be part of the object, but 'static' is for classes.
  // We'll make it a property of the strategy object itself.
  // currentChoicesBySymbol: new Map<string, string>(), // Will be initialized properly later

  async execute(context: StrategyContext<AISelectorStrategyParams>): Promise<StrategySignal> {
    const { evaluationLookbackPeriod, candidateStrategyIds: candidateStrategyIdsString, evaluationMetric: rawEvaluationMetric } = context.parameters;
    const symbol = context.symbol; 
    
    // Ensure evaluationMetric is valid, default to 'pnl'
    const validMetrics = ['pnl', 'sharpe', 'winRate'];
    const metric = validMetrics.includes(rawEvaluationMetric || '') ? rawEvaluationMetric : 'pnl';

    logger.info(`AISelectorStrategy: Starting execution for symbol ${symbol} at index ${context.currentIndex}. Evaluation Metric: ${metric}`);

    // Parse candidateStrategyIdsString
    const explicitCandidateIds = candidateStrategyIdsString && candidateStrategyIdsString.trim() !== ""
      ? candidateStrategyIdsString.split(',').map(id => id.trim())
      : [];

    // Fetch and filter candidate strategies
    let candidateStrategies = StrategyManager.getAvailableStrategies().filter(
      s => s.id !== this.id // Exclude self
      // Potentially add a flag to strategies like `isMetaStrategy` to exclude them all
    );

    if (explicitCandidateIds.length > 0) {
      candidateStrategies = candidateStrategies.filter(s => explicitCandidateIds.includes(s.id));
    }

    if (candidateStrategies.length === 0) {
      logger.warn(`AISelectorStrategy for ${symbol}: No candidate strategies found. Holding.`);
      return StrategySignal.HOLD;
    }

    // Ensure context.currentIndex is sufficient for lookback
    if (context.currentIndex < evaluationLookbackPeriod) {
      logger.info(`AISelectorStrategy for ${symbol}: Not enough historical data for evaluation (currentIndex ${context.currentIndex} < lookback ${evaluationLookbackPeriod}). Holding.`);
      // Optionally, execute a default strategy here if defined
      return StrategySignal.HOLD;
    }

    // Slice recent data for evaluation
    // The evaluation data should end at `context.currentIndex - 1` because the current bar (at `context.currentIndex`) is not yet complete.
    const evaluationData = context.historicalData.slice(
      Math.max(0, context.currentIndex - evaluationLookbackPeriod), // Ensure start index is not negative
      context.currentIndex // Data up to, but not including, the current bar
    );

    if (evaluationData.length < evaluationLookbackPeriod) {
      logger.warn(`AISelectorStrategy for ${symbol}: Insufficient evaluation data length (${evaluationData.length} < ${evaluationLookbackPeriod}). Holding.`);
      return StrategySignal.HOLD;
    }

    // --- Evaluation Loop ---
    // Note: The actual evaluation logic using different metrics ('sharpe', 'winRate') is not implemented in this step.
    // This step only focuses on adding the parameter and making it accessible.
    // The loop will still use 'maxPnl' for now.
    logger.verbose(`AISelectorStrategy for ${symbol}: Evaluating ${candidateStrategies.length} candidates over ${evaluationData.length} periods using metric: ${metric}.`);
    let bestStrategyId: string | null = null;
    let currentBestMetricValue = -Infinity; // Generalized for P&L, Sharpe (can be negative), WinRate (0-1)

    // TODO: Adapt comparison logic based on the chosen 'metric' (e.g. for Sharpe, higher is better; for WinRate, higher is better)
    // For now, the existing P&L logic will serve as the placeholder for other metrics as well.
    // If metric is 'pnl', currentBestMetricValue behaves like maxPnl.
    // If metric is 'sharpe', a different calculation and comparison would be needed.
    // If metric is 'winRate', a different calculation and comparison would be needed.

    interface SimulatedPosition {
      entryPrice: number;
      type: 'long' | 'short';
    }

    for (const candidateStrategy of candidateStrategies) {
      let simulatedPnl = 0;
      let simulatedTrades = 0;
      let profitableSimulatedTrades = 0;
      const periodReturns: number[] = [];
      let currentSimulatedPosition: SimulatedPosition | null = null;
      let lastPrice = evaluationData.length > 0 ? evaluationData[0].close : 0;


      // Prepare default parameters for the candidate strategy
      const candidateParams: { [key: string]: any } = {};
      for (const paramName in candidateStrategy.parameters) {
        candidateParams[paramName] = candidateStrategy.parameters[paramName].defaultValue;
      }

      logger.verbose(`AISelectorStrategy for ${symbol}: Simulating candidate ${candidateStrategy.id} with params: ${JSON.stringify(candidateParams)}`);

      // Simulate over the evaluationData
      for (let i = 0; i < evaluationData.length; i++) {
        const currentBar = evaluationData[i];
        if (!currentBar) continue; 

        const currentPrice = currentBar.close;
        const previousPrice = (i > 0) ? evaluationData[i-1].close : currentPrice;


        const simulationContext: StrategyContext<any> = {
          symbol: context.symbol,
          historicalData: evaluationData,
          currentIndex: i,
          parameters: candidateParams,
          portfolio: { 
            getCash: () => 100000,
            getPosition: () => {
              if (currentSimulatedPosition) {
                return { 
                  quantity: currentSimulatedPosition.type === 'long' ? 1 : -1, 
                  averagePrice: currentSimulatedPosition.entryPrice 
                };
              }
              return { quantity: 0, averagePrice: 0 };
            },
            getTrades: () => [], recordTrade: () => {}, getMarketValue: () => 0, getHistoricalPnl: () => [],
          } as unknown as Portfolio,
          trades: [], currentSignal: StrategySignal.HOLD, signalHistory: [],
        };

        const signalResult = await candidateStrategy.execute(simulationContext);
        const signalAction = typeof signalResult === 'string' ? signalResult : signalResult.action;


        // P&L and Win Rate Calculation Update
        if (signalAction === StrategySignal.BUY) {
          if (!currentSimulatedPosition) { // Open long
            currentSimulatedPosition = { entryPrice: currentPrice, type: 'long' };
            simulatedTrades++;
            logger.silly(`AISelectorStrategy Sim (${candidateStrategy.id}) for ${symbol}: Opened LONG at ${currentPrice} on bar ${i}`);
          } else if (currentSimulatedPosition.type === 'short') { // Close short
            const pnlFromTrade = currentSimulatedPosition.entryPrice - currentPrice;
            simulatedPnl += pnlFromTrade;
            if (pnlFromTrade > 0) profitableSimulatedTrades++;
            logger.silly(`AISelectorStrategy Sim (${candidateStrategy.id}) for ${symbol}: Closed SHORT at ${currentPrice} (Entry: ${currentSimulatedPosition.entryPrice}). P&L: ${pnlFromTrade.toFixed(2)} on bar ${i}`);
            currentSimulatedPosition = null;
          }
        } else if (signalAction === StrategySignal.SELL) {
          if (!currentSimulatedPosition) { // Open short
            currentSimulatedPosition = { entryPrice: currentPrice, type: 'short' };
            simulatedTrades++;
            logger.silly(`AISelectorStrategy Sim (${candidateStrategy.id}) for ${symbol}: Opened SHORT at ${currentPrice} on bar ${i}`);
          } else if (currentSimulatedPosition.type === 'long') { // Close long
            const pnlFromTrade = currentPrice - currentSimulatedPosition.entryPrice;
            simulatedPnl += pnlFromTrade;
            if (pnlFromTrade > 0) profitableSimulatedTrades++;
            logger.silly(`AISelectorStrategy Sim (${candidateStrategy.id}) for ${symbol}: Closed LONG at ${currentPrice} (Entry: ${currentSimulatedPosition.entryPrice}). P&L: ${pnlFromTrade.toFixed(2)} on bar ${i}`);
            currentSimulatedPosition = null;
          }
        }

        // Sharpe Ratio - Per-Candle Returns
        let candleReturn = 0;
        if (currentSimulatedPosition) { // Based on the position held *during* the candle (i.e., before this signal might close it)
                                      // or more accurately, position held at the *start* of this candle.
                                      // For simplicity, let's use the position status *after* the above BUY/SELL logic, assuming signal acts on current bar's open/close.
                                      // This means the return is for the period the position was held leading *up to* the currentPrice.
          if (currentSimulatedPosition.type === 'long') {
            candleReturn = previousPrice > 0 ? (currentPrice - previousPrice) / previousPrice : 0;
          } else if (currentSimulatedPosition.type === 'short') {
            candleReturn = previousPrice > 0 ? (previousPrice - currentPrice) / previousPrice : 0;
          }
        }
        periodReturns.push(candleReturn);
        lastPrice = currentPrice;
      }

      // Finalize P&L for any open position
      if (currentSimulatedPosition && evaluationData.length > 0) {
        // lastPrice is already updated from the loop
        if (currentSimulatedPosition.type === 'long') {
          const pnlFromTrade = lastPrice - currentSimulatedPosition.entryPrice;
          simulatedPnl += pnlFromTrade;
          if (pnlFromTrade > 0) profitableSimulatedTrades++; // Count it if the "close" is profitable
          logger.silly(`AISelectorStrategy Sim (${candidateStrategy.id}) for ${symbol}: Auto-closed LONG at ${lastPrice} (Entry: ${currentSimulatedPosition.entryPrice}). P&L: ${pnlFromTrade.toFixed(2)} at end of eval.`);
        } else if (currentSimulatedPosition.type === 'short') {
          const pnlFromTrade = currentSimulatedPosition.entryPrice - lastPrice;
          simulatedPnl += pnlFromTrade;
          if (pnlFromTrade > 0) profitableSimulatedTrades++;
          logger.silly(`AISelectorStrategy Sim (${candidateStrategy.id}) for ${symbol}: Auto-closed SHORT at ${lastPrice} (Entry: ${currentSimulatedPosition.entryPrice}). P&L: ${pnlFromTrade.toFixed(2)} at end of eval.`);
        }
        currentSimulatedPosition = null;
      }
      
      // Calculate Final Metrics
      const pnlScore = simulatedPnl;
      const winRateScore = simulatedTrades > 0 ? profitableSimulatedTrades / simulatedTrades : 0;
      
      let sharpeScore = 0;
      if (periodReturns.length >= 2) { // Need at least 2 returns for standard deviation
        const averageReturn = periodReturns.reduce((a, b) => a + b, 0) / periodReturns.length;
        const stdDev = Math.sqrt(periodReturns.map(x => Math.pow(x - averageReturn, 2)).reduce((a, b) => a + b, 0) / (periodReturns.length -1)); // Sample std dev
        
        // Assuming risk-free rate of 0 for simplicity.
        // Handle stdDev = 0: If avg return is positive, very high Sharpe; negative, very low; zero, zero.
        if (stdDev === 0) {
          sharpeScore = averageReturn > 0 ? 1000 : (averageReturn < 0 ? -1000 : 0); // Arbitrary large numbers for effectively infinite Sharpe
        } else {
          sharpeScore = averageReturn / stdDev;
        }
        // Annualize Sharpe: (Daily Sharpe) * sqrt(252 trading days). Assuming daily data for now.
        // This requires knowing the interval of evaluationData. For now, let's skip annualization here.
        // sharpeScore = sharpeScore * Math.sqrt(252); // Example if daily data
      }

      let calculatedMetricValue = 0;
      switch (metric) {
        case 'pnl':
          calculatedMetricValue = pnlScore;
          break;
        case 'winRate':
          calculatedMetricValue = winRateScore;
          break;
        case 'sharpe':
          calculatedMetricValue = sharpeScore;
          break;
        default: // Should not happen due to earlier validation
          calculatedMetricValue = pnlScore;
      }
      
      logger.verbose(`AISelectorStrategy for ${symbol}: Candidate ${candidateStrategy.id} - P&L: ${pnlScore.toFixed(2)}, WinRate: ${winRateScore.toFixed(2)}, Sharpe: ${sharpeScore.toFixed(2)}. Chosen metric (${metric}) value: ${calculatedMetricValue.toFixed(2)}`);

      if (calculatedMetricValue > currentBestMetricValue) {
        currentBestMetricValue = calculatedMetricValue;
        bestStrategyId = candidateStrategy.id;
      }
    }

    if (!bestStrategyId) {
      logger.warn(`AISelectorStrategy for ${symbol}: No suitable strategy found after evaluation (metric: ${metric}, best value: ${currentBestMetricValue}). Holding.`);
      return StrategySignal.HOLD;
    }

    logger.info(`AISelectorStrategy for ${symbol}: Chose strategy ${bestStrategyId} using metric '${metric}' with score ${currentBestMetricValue.toFixed(4)}.`);
    (this as any).currentChoicesBySymbol.set(symbol, bestStrategyId);

    const finalSelectedStrategy = StrategyManager.getStrategy(bestStrategyId);
    if (!finalSelectedStrategy) {
      logger.error(`AISelectorStrategy for ${symbol}: Failed to retrieve chosen strategy ${bestStrategyId} from manager. Holding.`);
      return StrategySignal.HOLD;
    }

    logger.info(`AISelectorStrategy for ${symbol}: Executing chosen strategy ${finalSelectedStrategy.name} (${finalSelectedStrategy.id})`);
    return finalSelectedStrategy.execute(context); // Execute with the original context
  }
};

// Initialize the static-like property here if needed, or handle it within the execute method's scope
// For true static behavior accessible from elsewhere, this might need to be a class or a separate export.
// For now, let's assume it's a property of this specific strategy object.
(aiSelectorStrategy as any).currentChoicesBySymbol = new Map<string, string>();

// Optional: Helper to get the static cache if needed by other parts of the system
export function getAISelectorChoices(): Map<string, string> {
  return (aiSelectorStrategy as any).currentChoicesBySymbol;
}
