import { TradingStrategy, StrategyContext, StrategySignal, StrategyParameterDefinition } from '../strategy.types';
import { StrategyManager } from '../strategyManager';
import { logger } from '../../utils/logger';
import { Portfolio } from '../../portfolio/portfolio'; // Assuming this path
import { Trade } from '../../portfolio/trade'; // Assuming this path
// TechnicalIndicators might not be directly needed if strategies encapsulate their own indicator use.

interface AISelectorStrategyParams {
  evaluationLookbackPeriod: number;
  candidateStrategyIds?: string[];
  evaluationMetric?: 'pnl' | 'sharpe' | 'winRate' | string;
  optimizeParameters?: boolean;
}

// Helper function for Grid Search
function generateParameterCombinations(
    optimizableParams: Array<{ name: string; min: number; max: number; step: number; }>,
    paramDefaults: Record<string, any>
): Array<Record<string, any>> {
    const combinations: Array<Record<string, any>> = [];
    const tempCombination: Record<string, any> = { ...paramDefaults };

    function recurse(paramIndex: number) {
        if (paramIndex === optimizableParams.length) {
            combinations.push({ ...tempCombination });
            return;
        }

        const param = optimizableParams[paramIndex];
        // Ensure min, max, step are valid numbers
        const min = Number(param.min);
        const max = Number(param.max);
        const step = Number(param.step);

        if (isNaN(min) || isNaN(max) || isNaN(step)) {
             logger.warn(`[generateParameterCombinations] Invalid min/max/step for param ${param.name}. Skipping.`);
             recurse(paramIndex + 1); // Try next parameter
             return;
        }
        if (step <= 0) { // Prevent infinite loops or no progress
            logger.warn(`[generateParameterCombinations] Invalid step value ${step} for param ${param.name}. Using default value only.`);
            tempCombination[param.name] = paramDefaults[param.name] !== undefined ? paramDefaults[param.name] : min; // Use default or min
            recurse(paramIndex + 1);
            return;
        }

        let currentValue = min;
        while (currentValue <= max) {
            tempCombination[param.name] = currentValue;
            recurse(paramIndex + 1);
            if (currentValue === max && step > 0) break; // Ensure max is included but avoid overshooting with large steps
            currentValue += step;
            if (currentValue > max && (currentValue - step) < max) { // Add max if step overshoots it
                tempCombination[param.name] = max;
                recurse(paramIndex + 1);
                break;
            }
        }
    }
    
    if (optimizableParams.length === 0) {
        return [paramDefaults]; // No optimizable params, return defaults
    }

    recurse(0);
    return combinations.length > 0 ? combinations : [paramDefaults]; // Fallback if recursion somehow yields no combos
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
      step: 5, // Added step
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
        { value: 'sharpe', label: 'Sharpe Ratio' }, 
        { value: 'winRate', label: 'Win Rate' }, 
      ],
    },
    optimizeParameters: {
        name: 'optimizeParameters',
        label: 'Optimize Parameters of Candidate Strategies',
        type: 'boolean',
        defaultValue: false,
        description: 'If true, AI will attempt to optimize parameters of candidate strategies using Grid Search. Significantly increases execution time.',
    },
  },

  // Static cache to store symbol -> chosenStrategyId
  // This needs to be part of the object, but 'static' is for classes.
  // We'll make it a property of the strategy object itself.
  // currentChoicesBySymbol: new Map<string, string>(), // Will be initialized properly later
  // Map to store best parameters found for each chosen strategy ID, if optimization was run
  // This might be better managed externally or passed differently for final execution
  optimizedParamsForChoice: new Map<string, Record<string, any>>(),


  async execute(context: StrategyContext<AISelectorStrategyParams>): Promise<StrategySignal> {
    const { 
        evaluationLookbackPeriod, 
        candidateStrategyIds: candidateStrategyIdsString, 
        evaluationMetric: rawEvaluationMetric,
        optimizeParameters 
    } = context.parameters;
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
    
    let bestOverallParams: Record<string, any> | null = null; // To store optimized params for the chosen strategy

    for (const candidateStrategy of candidateStrategies) {
      let bestParamsForCandidate: Record<string, any> | null = null;
      let bestMetricScoreForCandidate = -Infinity;

      const paramSetsToSimulate: Array<Record<string, any>> = [];

      if (optimizeParameters) {
        const optimizableParams = candidateStrategy.parameters.filter(
          p => p.type === 'number' && p.min !== undefined && p.max !== undefined && p.step !== undefined && p.min <= p.max && p.step > 0
        ).map(p => ({ name: p.name, min: p.min!, max: p.max!, step: p.step! }));
        
        const defaultParams: Record<string, any> = {};
        candidateStrategy.parameters.forEach(p => defaultParams[p.name] = p.defaultValue);

        if (optimizableParams.length > 0) {
          const combinations = generateParameterCombinations(optimizableParams, defaultParams);
          if (combinations.length > 1000) { // Warning for excessive combinations
            logger.warn(`[AISelectorStrategy] Candidate ${candidateStrategy.id} has ${combinations.length} param combinations. This may be slow.`);
          }
          paramSetsToSimulate.push(...combinations);
        } else {
          paramSetsToSimulate.push(defaultParams); // No optimizable params, use defaults
        }
      } else {
        // Use only default parameters if not optimizing
        const defaultParams: Record<string, any> = {};
        candidateStrategy.parameters.forEach(p => defaultParams[p.name] = p.defaultValue);
        paramSetsToSimulate.push(defaultParams);
      }
      
      logger.verbose(`[AISelectorStrategy] Simulating ${candidateStrategy.id} with ${paramSetsToSimulate.length} param sets.`);

      for (const currentCandidateParams of paramSetsToSimulate) {
        // --- Start of single simulation run with currentCandidateParams ---
        let simulatedPnl = 0;
        let simulatedTrades = 0;
        let profitableSimulatedTrades = 0;
        const periodReturns: number[] = [];
        let currentSimulatedPosition: SimulatedPosition | null = null;
        let lastPrice = evaluationData.length > 0 ? evaluationData[0].close : 0;

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
            parameters: currentCandidateParams, // Use current combination or defaults
            portfolio: { 
              getCash: () => 100000,
              getPosition: () => currentSimulatedPosition ? { quantity: currentSimulatedPosition.type === 'long' ? 1 : -1, averagePrice: currentSimulatedPosition.entryPrice } : { quantity: 0, averagePrice: 0 },
              getTrades: () => [], recordTrade: () => {}, getMarketValue: () => 0, getHistoricalPnl: () => [],
            } as unknown as Portfolio,
            trades: [], currentSignal: StrategySignal.HOLD, signalHistory: [],
          };

          const signalResult = await candidateStrategy.execute(simulationContext);
          const signalAction = typeof signalResult === 'string' ? signalResult : signalResult.action;

          if (signalAction === StrategySignal.BUY) {
            if (!currentSimulatedPosition) {
              currentSimulatedPosition = { entryPrice: currentPrice, type: 'long' };
              simulatedTrades++;
            } else if (currentSimulatedPosition.type === 'short') {
              const pnlFromTrade = currentSimulatedPosition.entryPrice - currentPrice;
              simulatedPnl += pnlFromTrade;
              if (pnlFromTrade > 0) profitableSimulatedTrades++;
              currentSimulatedPosition = null;
            }
          } else if (signalAction === StrategySignal.SELL) {
            if (!currentSimulatedPosition) {
              currentSimulatedPosition = { entryPrice: currentPrice, type: 'short' };
              simulatedTrades++;
            } else if (currentSimulatedPosition.type === 'long') {
              const pnlFromTrade = currentPrice - currentSimulatedPosition.entryPrice;
              simulatedPnl += pnlFromTrade;
              if (pnlFromTrade > 0) profitableSimulatedTrades++;
              currentSimulatedPosition = null;
            }
          }

          let candleReturn = 0;
          if (currentSimulatedPosition) {
            if (currentSimulatedPosition.type === 'long') candleReturn = previousPrice > 0 ? (currentPrice - previousPrice) / previousPrice : 0;
            else candleReturn = previousPrice > 0 ? (previousPrice - currentPrice) / previousPrice : 0;
          }
          periodReturns.push(candleReturn);
          lastPrice = currentPrice;
        }

        if (currentSimulatedPosition && evaluationData.length > 0) {
          if (currentSimulatedPosition.type === 'long') {
            const pnlFromTrade = lastPrice - currentSimulatedPosition.entryPrice;
            simulatedPnl += pnlFromTrade;
            if (pnlFromTrade > 0) profitableSimulatedTrades++;
          } else {
            const pnlFromTrade = currentSimulatedPosition.entryPrice - lastPrice;
            simulatedPnl += pnlFromTrade;
            if (pnlFromTrade > 0) profitableSimulatedTrades++;
          }
        }
        
        const pnlScore = simulatedPnl;
        const winRateScore = simulatedTrades > 0 ? profitableSimulatedTrades / simulatedTrades : 0;
        let sharpeScore = 0;
        if (periodReturns.length >= 2) {
          const averageReturn = periodReturns.reduce((a, b) => a + b, 0) / periodReturns.length;
          const stdDev = Math.sqrt(periodReturns.map(x => Math.pow(x - averageReturn, 2)).reduce((a, b) => a + b, 0) / (periodReturns.length -1));
          if (stdDev === 0) sharpeScore = averageReturn > 0 ? 1000 : (averageReturn < 0 ? -1000 : 0);
          else sharpeScore = averageReturn / stdDev;
        }

        let currentCombinationScore = 0;
        switch (metric) {
          case 'pnl': currentCombinationScore = pnlScore; break;
          case 'winRate': currentCombinationScore = winRateScore; break;
          case 'sharpe': currentCombinationScore = sharpeScore; break;
          default: currentCombinationScore = pnlScore;
        }
        // --- End of single simulation run ---

        if (currentCombinationScore > bestMetricScoreForCandidate) {
          bestMetricScoreForCandidate = currentCombinationScore;
          bestParamsForCandidate = { ...currentCandidateParams }; 
        }
      } // End of loop over paramSetsToSimulate

      const calculatedMetricValueForCandidate = bestMetricScoreForCandidate;
      logger.verbose(`AISelectorStrategy for ${symbol}: Candidate ${candidateStrategy.id} best score using metric '${metric}': ${calculatedMetricValueForCandidate.toFixed(4)}. Optimized Params: ${optimizeParameters ? JSON.stringify(bestParamsForCandidate) : "N/A"}`);
      
      if (calculatedMetricValueForCandidate > currentBestMetricValue) {
        currentBestMetricValue = calculatedMetricValueForCandidate;
        bestStrategyId = candidateStrategy.id;
        bestOverallParams = bestParamsForCandidate; // Store the best params found for the currently best strategy
      }
    }

    if (!bestStrategyId) {
      logger.warn(`AISelectorStrategy for ${symbol}: No suitable strategy found after evaluation (metric: ${metric}, best value: ${currentBestMetricValue}). Holding.`);
      return StrategySignal.HOLD;
    }

    logger.info(`AISelectorStrategy for ${symbol}: Chose strategy ${bestStrategyId} using metric '${metric}' with score ${currentBestMetricValue.toFixed(4)}.`);
    (this as any).currentChoicesBySymbol.set(symbol, bestStrategyId); 
    if (bestStrategyId && bestOverallParams && Object.keys(bestOverallParams).length > 0) { // Ensure bestOverallParams is not empty
        (this as any).optimizedParamsForChoice.set(symbol, { strategyId: bestStrategyId, params: bestOverallParams });
        logger.info(`AISelectorStrategy for ${symbol}: Stored optimized params for ${bestStrategyId}: ${JSON.stringify(bestOverallParams)}`);
    } else if (bestStrategyId) {
        // If optimization was off or no better params found, ensure any old optimized params for this symbol are cleared.
        // And store the default params used for this choice.
        const defaultParamsForChosenStrategy: Record<string, any> = {};
        const tempStrategy = StrategyManager.getStrategy(bestStrategyId);
        if (tempStrategy) {
            tempStrategy.parameters.forEach(p => defaultParamsForChosenStrategy[p.name] = p.defaultValue);
        }
        (this as any).optimizedParamsForChoice.set(symbol, { strategyId: bestStrategyId, params: defaultParamsForChosenStrategy });
        logger.info(`AISelectorStrategy for ${symbol}: Stored default params for ${bestStrategyId} as optimization was off or yielded no improvement.`);
    }


    const finalSelectedStrategy = StrategyManager.getStrategy(bestStrategyId);
    if (!finalSelectedStrategy) {
      logger.error(`AISelectorStrategy for ${symbol}: Failed to retrieve chosen strategy ${bestStrategyId} from manager. Holding.`);
      return StrategySignal.HOLD;
    }
    
    // Prepare context for final execution
    const strategyContextForExecution: StrategyContext<any> = {
        ...context, // Clone original context
        parameters: {}, // Will be populated below
    };

    // Get default parameters for the selected strategy
    const defaultSelectedStrategyParams: Record<string, any> = {};
    finalSelectedStrategy.parameters.forEach(p => {
        defaultSelectedStrategyParams[p.name] = p.defaultValue;
    });

    if (optimizeParameters && bestOverallParams && Object.keys(bestOverallParams).length > 0) {
        // Merge defaults with optimized parameters
        strategyContextForExecution.parameters = {
            ...defaultSelectedStrategyParams,
            ...bestOverallParams 
        };
        logger.info(`AISelectorStrategy for ${symbol}: Executing ${finalSelectedStrategy.id} with OPTIMIZED parameters: ${JSON.stringify(strategyContextForExecution.parameters)}`);
    } else {
        // Execute with default parameters of the chosen strategy
        strategyContextForExecution.parameters = defaultSelectedStrategyParams;
        logger.info(`AISelectorStrategy for ${symbol}: Executing ${finalSelectedStrategy.id} with DEFAULT parameters: ${JSON.stringify(strategyContextForExecution.parameters)}`);
    }
    
    return finalSelectedStrategy.execute(strategyContextForExecution); 
  }
};

// Initialize the static-like properties
(aiSelectorStrategy as any).currentChoicesBySymbol = new Map<string, string>();
// Stores: symbol -> { strategyId: string, params: Record<string, any> }
(aiSelectorStrategy as any).optimizedParamsForChoice = new Map<string, { strategyId: string, params: Record<string, any> }>();


// Helper function for API to get current AI choice and its parameters
export interface AISelectorChoiceState {
    chosenStrategyId: string | null;
    chosenStrategyName: string | null;
    parametersUsed: Record<string, any> | null;
    message?: string; // Optional message, e.g., if no choice made yet
}

export function getAISelectorActiveState(symbol: string): AISelectorChoiceState {
    const choiceData = (aiSelectorStrategy as any).optimizedParamsForChoice.get(symbol);
    
    if (choiceData && choiceData.strategyId) {
        const strategyDetails = StrategyManager.getStrategy(choiceData.strategyId);
        return {
            chosenStrategyId: choiceData.strategyId,
            chosenStrategyName: strategyDetails ? strategyDetails.name : "Unknown Strategy",
            parametersUsed: choiceData.params,
        };
    }
    
    // Fallback if no entry in optimizedParamsForChoice, but there might be an ID in currentChoicesBySymbol (e.g. from older version or error)
    const chosenStrategyId = (aiSelectorStrategy as any).currentChoicesBySymbol.get(symbol);
    if (chosenStrategyId) {
        const strategyDetails = StrategyManager.getStrategy(chosenStrategyId);
        // Attempt to provide default params if specific params for this choice weren't stored
        let params: Record<string, any> | null = null;
        if (strategyDetails) {
            params = {};
            strategyDetails.parameters.forEach(p => params![p.name] = p.defaultValue);
        }
        return {
            chosenStrategyId: chosenStrategyId,
            chosenStrategyName: strategyDetails ? strategyDetails.name : "Unknown Strategy",
            parametersUsed: params,
            message: "Parameters used are defaults; specific optimized/selected params not found in current state."
        };
    }

    return {
        chosenStrategyId: null,
        chosenStrategyName: null,
        parametersUsed: null,
        message: "No strategy choice has been made for this symbol yet."
    };
}

// Deprecated or to be reviewed:
// export function getAISelectorChoices(): Map<string, string> {
//   return (aiSelectorStrategy as any).currentChoicesBySymbol;
// }
// export function getAISelectorOptimizedParams(strategyId: string, symbol: string): Record<string, any> | undefined {
//     const choice = (aiSelectorStrategy as any).optimizedParamsForChoice.get(symbol);
//     if (choice && choice.strategyId === strategyId) {
//         return choice.params;
//     }
//     return undefined;
// }
