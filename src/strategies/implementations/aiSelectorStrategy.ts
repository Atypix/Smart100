import { TradingStrategy, StrategyContext, StrategySignal, StrategyParameterDefinition } from '../strategy.types';
import { StrategyManager } from '../strategyManager';
import { logger } from '../../utils/logger';
import { Portfolio } from '../../portfolio/portfolio'; // Assuming this path
import { Trade } from '../../portfolio/trade'; // Assuming this path
// TechnicalIndicators might not be directly needed if strategies encapsulate their own indicator use.

interface AISelectorStrategyParams {
  evaluationLookbackPeriod: number;
  candidateStrategyIds?: string[];
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
  },

  // Static cache to store symbol -> chosenStrategyId
  // This needs to be part of the object, but 'static' is for classes.
  // We'll make it a property of the strategy object itself.
  // currentChoicesBySymbol: new Map<string, string>(), // Will be initialized properly later

  async execute(context: StrategyContext<AISelectorStrategyParams>): Promise<StrategySignal> {
    logger.info(`AISelectorStrategy: Starting execution for symbol ${context.symbol} at index ${context.currentIndex}`);
    const { evaluationLookbackPeriod, candidateStrategyIds: candidateStrategyIdsString } = context.parameters;
    const symbol = context.symbol; // Assuming context.symbol is available and correct

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
    logger.verbose(`AISelectorStrategy for ${symbol}: Evaluating ${candidateStrategies.length} candidates over ${evaluationData.length} periods.`);
    let bestStrategyId: string | null = null;
    let maxPnl = -Infinity;

    for (const candidateStrategy of candidateStrategies) {
      let currentPnl = 0;
      let position = 0; // 0 = no position, 1 = long
      let entryPrice = 0;

      // Prepare default parameters for the candidate strategy
      const candidateParams: { [key: string]: any } = {};
      for (const paramName in candidateStrategy.parameters) {
        candidateParams[paramName] = candidateStrategy.parameters[paramName].defaultValue;
      }

      logger.verbose(`AISelectorStrategy for ${symbol}: Simulating candidate ${candidateStrategy.id} with params: ${JSON.stringify(candidateParams)}`);

      // Simulate over the evaluationData
      for (let i = 0; i < evaluationData.length; i++) {
        const currentBar = evaluationData[i];
        if (!currentBar) continue; // Should not happen if data is clean

        const simulationContext: StrategyContext<any> = {
          // symbol: symbol, // Already available via currentBar.symbol if needed
          symbol: context.symbol, // Pass the main symbol
          historicalData: evaluationData, // The sliced historical data for this simulation run
          currentIndex: i, // Current index within the evaluationData slice
          parameters: candidateParams, // Default parameters for the candidate strategy
          // TODO: The following need careful consideration for simulation:
          // What should portfolio, trades, currentSignal, and signalHistory be for simulation?
          // For a simple P&L, we might not need a full Portfolio object.
          portfolio: { // Simplified mock portfolio for this simulation
            getCash: () => 100000, // Arbitrary large number, won't be used in this P&L calc
            getPosition: () => ({ quantity: position, averagePrice: entryPrice }),
            getTrades: () => [],
            recordTrade: (trade: Trade) => { /* Mock */ },
            getMarketValue: () => 0, // Mock
            getHistoricalPnl: () => [], // Mock
          } as unknown as Portfolio, // Cast to Portfolio, acknowledging it's a simplified mock
          trades: [], // Mock
          currentSignal: StrategySignal.HOLD, // Mock, strategy will determine this
          signalHistory: [], // Mock
          // logger: logger, // Could pass logger if strategies use it heavily
        };

        // Execute the candidate strategy
        const signal = await candidateStrategy.execute(simulationContext);

        if (position === 0 && signal === StrategySignal.BUY) {
          position = 1;
          entryPrice = currentBar.close;
          logger.silly(`AISelectorStrategy Sim (${candidateStrategy.id}) for ${symbol}: BUY at ${entryPrice} on bar ${i}`);
        } else if (position === 1 && signal === StrategySignal.SELL) {
          currentPnl += (currentBar.close - entryPrice);
          position = 0;
          entryPrice = 0;
          logger.silly(`AISelectorStrategy Sim (${candidateStrategy.id}) for ${symbol}: SELL at ${currentBar.close} (Entry: ${entryPrice}). P&L: ${currentPnl} on bar ${i}`);
        }
        // Hold signals do nothing to P&L or position
      }

      // If still in a position at the end, close it at the last price for P&L calculation
      if (position === 1 && evaluationData.length > 0) {
        const lastPrice = evaluationData[evaluationData.length - 1].close;
        currentPnl += (lastPrice - entryPrice);
        logger.silly(`AISelectorStrategy Sim (${candidateStrategy.id}) for ${symbol}: Closed final position at ${lastPrice}. Final P&L for sim: ${currentPnl}`);
      }

      logger.verbose(`AISelectorStrategy for ${symbol}: Candidate ${candidateStrategy.id} simulated P&L: ${currentPnl.toFixed(2)}`);

      if (currentPnl > maxPnl) {
        maxPnl = currentPnl;
        bestStrategyId = candidateStrategy.id;
      }
    }

    if (!bestStrategyId) {
      logger.warn(`AISelectorStrategy for ${symbol}: No suitable strategy found after evaluation. Holding.`);
      return StrategySignal.HOLD;
    }

    logger.info(`AISelectorStrategy for ${symbol}: Chose strategy ${bestStrategyId} with simulated P&L ${maxPnl.toFixed(2)}.`);
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
