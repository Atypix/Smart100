import { TradingStrategy, StrategyContext, StrategySignal, StrategyParameterDefinition, AIDecision } from '../strategy.types';
import * as StrategyManagerModule from '../strategyManager';
import logger from '../../utils/logger';
import { Portfolio } from '../../backtest';
import { HistoricalDataPoint } from '../../services/dataService'; // Added for evaluationData type
// import { Trade } from '../../portfolio/trade';
// TechnicalIndicators might not be directly needed if strategies encapsulate their own indicator use.

// Module-scoped stateful properties
let currentChoicesBySymbol = new Map<string, string>();
let optimizedParamsForChoice = new Map<string, { strategyId: string, params: Record<string, any> }>();
let lastAIDecision: AIDecision | null = null;

// Removed local AIDecision interface

interface AISelectorStrategyParams {
  evaluationLookbackPeriod: number;
  candidateStrategyIds?: string; // Corrected type to string
  evaluationMetric?: 'pnl' | 'sharpe' | 'winRate' | string;
  optimizeParameters?: boolean;
}

// Helper function for Grid Search
function generateParameterCombinations(
    optimizableParams: Array<{ name: string; min: number; max: number; step: number; }>,
    paramDefaults: Record<string, number | string | boolean>
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
  parameters: [
    { name: 'evaluationLookbackPeriod', label: 'Evaluation Lookback Period', type: 'number', defaultValue: 30, min: 5, max: 200, step: 5, description: 'Number of recent data points to evaluate candidate strategies.' },
    { name: 'candidateStrategyIds', label: 'Candidate Strategy IDs (comma-separated)', type: 'string', defaultValue: "", description: 'Optional. A comma-separated list of strategy IDs to consider. If empty, all available strategies (excluding self) will be candidates.' },
    { name: 'evaluationMetric', label: 'Evaluation Metric for AI Selection', type: 'string', defaultValue: 'pnl', description: "Metric to evaluate candidate strategies. Options: 'pnl' (Profit/Loss), 'sharpe' (Sharpe Ratio), 'winRate' (Win Rate).", options: [ { value: 'pnl', label: 'Profit/Loss' }, { value: 'sharpe', label: 'Sharpe Ratio' }, { value: 'winRate', label: 'Win Rate' }] },
    { name: 'optimizeParameters', label: 'Optimize Parameters of Candidate Strategies', type: 'boolean', defaultValue: false, description: 'If true, AI will attempt to optimize parameters of candidate strategies using Grid Search. Significantly increases execution time.' }
  ],

  // Static cache to store symbol -> chosenStrategyId
  // This needs to be part of the object, but 'static' is for classes.
  // We'll make it a property of the strategy object itself.
  // currentChoicesBySymbol: new Map<string, string>(), // Will be initialized properly later
  // Map to store best parameters found for each chosen strategy ID, if optimization was run
  // This might be better managed externally or passed differently for final execution
  // optimizedParamsForChoice: new Map<string, Record<string, any>>(), // Removed
  // lastAIDecision: null as AIDecision | null, // Removed


  async execute(context: StrategyContext<AISelectorStrategyParams>): Promise<StrategySignal> {
    // Reset lastAIDecision at the beginning of each execution
    lastAIDecision = null; // Use module-scoped variable

    const {
        evaluationLookbackPeriod,
        candidateStrategyIds: candidateStrategyIdsString,
        evaluationMetric: rawEvaluationMetric,
        optimizeParameters
    } = context.parameters;
    const symbol = context.symbol;
    
    // Ensure evaluationMetric is valid, default to 'pnl'
    const validMetrics = ['pnl', 'sharpe', 'winRate'];
    const definedRawMetric = typeof rawEvaluationMetric === 'string' ? rawEvaluationMetric : 'pnl';
    const metric = validMetrics.includes(definedRawMetric) ? definedRawMetric : 'pnl';

    logger.info(`AISelectorStrategy: Starting execution for symbol ${symbol} at index ${context.currentIndex}. Evaluation Metric: ${metric}`);

    // Parse candidateStrategyIdsString
    const explicitCandidateIds = candidateStrategyIdsString && candidateStrategyIdsString.trim() !== ""
      ? candidateStrategyIdsString.split(',').map((id: string) => id.trim()) 
      : [];

    // Fetch and filter candidate strategies
    let candidateStrategies = StrategyManagerModule.getAvailableStrategies().filter(
      (s: any) => s.id !== this.id // Exclude self, typed s as any
      // Potentially add a flag to strategies like `isMetaStrategy` to exclude them all
    );

    if (explicitCandidateIds.length > 0) {
      candidateStrategies = candidateStrategies.filter((s: any) => explicitCandidateIds.includes(s.id)); // Typed s as any
    }

    if (candidateStrategies.length === 0) {
      logger.warn(`AISelectorStrategy for ${symbol}: No candidate strategies found. Holding.`);
      return { action: 'HOLD' };
    }

    // Ensure context.currentIndex is sufficient for lookback
    if (context.currentIndex < evaluationLookbackPeriod) {
      logger.info(`AISelectorStrategy for ${symbol}: Not enough historical data for evaluation (currentIndex ${context.currentIndex} < lookback ${evaluationLookbackPeriod}). Holding.`);
      // Optionally, execute a default strategy here if defined
      return { action: 'HOLD' };
    }

    // Slice recent data for evaluation
    // The evaluation data should end at `context.currentIndex - 1` because the current bar (at `context.currentIndex`) is not yet complete.
    const evaluationData: HistoricalDataPoint[] = context.historicalData.slice(
      Math.max(0, context.currentIndex - evaluationLookbackPeriod),
      context.currentIndex
    );

    if (evaluationData.length < evaluationLookbackPeriod) {
      logger.warn(`AISelectorStrategy for ${symbol}: Insufficient evaluation data length (${evaluationData.length} < ${evaluationLookbackPeriod}). Holding.`);
      return { action: 'HOLD' };
    }

    logger.verbose(`AISelectorStrategy for ${symbol}: Evaluating ${candidateStrategies.length} candidates over ${evaluationData.length} periods using metric: ${metric}.`);
    let bestStrategyId: string | null = null;
    let currentBestMetricValue = -Infinity;

    interface SimulatedPosition {
      entryPrice: number;
      type: 'long' | 'short';
    }

    let bestOverallParams: Record<string, any> | null = null;

    for (const candidateStrategy of candidateStrategies) {
      let bestParamsForCandidate: Record<string, any> | null = null;
      let bestMetricScoreForCandidate = -Infinity;
      const paramSetsToSimulate: Array<Record<string, any>> = [];

      if (optimizeParameters) {
        const optimizableParams = (candidateStrategy.parameters || []).filter(
          (p: StrategyParameterDefinition) => p.type === 'number' && p.min !== undefined && p.max !== undefined && p.step !== undefined && p.min <= p.max && p.step > 0
        ).map((p: StrategyParameterDefinition) => ({ name: p.name, min: p.min!, max: p.max!, step: p.step! }));
        
        const defaultParams: Record<string, any> = {};
        (candidateStrategy.parameters || []).forEach((p: StrategyParameterDefinition) => defaultParams[p.name] = p.defaultValue);

        if (optimizableParams.length > 0) {
          const combinations = generateParameterCombinations(optimizableParams, defaultParams);
          if (combinations.length > 1000) {
            logger.warn(`[AISelectorStrategy] Candidate ${candidateStrategy.id} has ${combinations.length} param combinations. This may be slow.`);
          }
          paramSetsToSimulate.push(...combinations);
        } else {
          paramSetsToSimulate.push(defaultParams);
        }
      } else {
        const defaultParams: Record<string, any> = {};
        (candidateStrategy.parameters || []).forEach((p: StrategyParameterDefinition) => defaultParams[p.name] = p.defaultValue);
        paramSetsToSimulate.push(defaultParams);
      }
      
      logger.verbose(`[AISelectorStrategy] Simulating ${candidateStrategy.id} with ${paramSetsToSimulate.length} param sets.`);

      for (const currentCandidateParams of paramSetsToSimulate) {
        let simulatedPnl = 0;
        let simulatedTrades = 0;
        let profitableSimulatedTrades = 0;
        const periodReturns: number[] = [];
        let currentSimulatedPosition: SimulatedPosition | null = null;
        let lastPrice = evaluationData.length > 0 ? evaluationData[0].close : 0;

        for (let i = 0; i < evaluationData.length; i++) {
          const currentBar = evaluationData[i];
          if (!currentBar) continue; 

          const currentPrice = currentBar.close;
          const previousPrice = (i > 0) ? evaluationData[i-1].close : currentPrice;

          const simulationContext: StrategyContext<Record<string, any>> = {
            symbol: context.symbol,
            historicalData: evaluationData,
            currentIndex: i,
            parameters: currentCandidateParams,
            portfolio: { 
              getCash: () => 100000,
              getPosition: () => currentSimulatedPosition ? { quantity: currentSimulatedPosition.type === 'long' ? 1 : -1, averagePrice: currentSimulatedPosition.entryPrice } : { quantity: 0, averagePrice: 0 },
              getTrades: () => [], recordTrade: () => {}, getMarketValue: () => 0, getHistoricalPnl: () => [],
            } as unknown as Portfolio, 
            tradeHistory: [], 
            signalHistory: [],
          };

          const signalResult = await candidateStrategy.execute(simulationContext);
          const signalAction = typeof signalResult === 'string' ? signalResult : signalResult.action;

          if (signalAction === 'BUY') {
            if (!currentSimulatedPosition) {
              currentSimulatedPosition = { entryPrice: currentPrice, type: 'long' };
              simulatedTrades++;
            } else if (currentSimulatedPosition.type === 'short') {
              const pnlFromTrade = currentSimulatedPosition.entryPrice - currentPrice;
              simulatedPnl += pnlFromTrade;
              if (pnlFromTrade > 0) profitableSimulatedTrades++;
              currentSimulatedPosition = null;
            }
          } else if (signalAction === 'SELL') {
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
          if (stdDev === 0) sharpeScore = averageReturn > 0 ? 1000 : (averageReturn < 0 ? -1000 : 0); // Assign large/small fixed Sharpe for zero std dev
          else sharpeScore = averageReturn / stdDev;
        }

        let currentCombinationScore = 0;
        switch (metric) {
          case 'pnl': currentCombinationScore = pnlScore; break;
          case 'winRate': currentCombinationScore = winRateScore; break;
          case 'sharpe': currentCombinationScore = sharpeScore; break;
          default: currentCombinationScore = pnlScore;
        }

        if (currentCombinationScore > bestMetricScoreForCandidate) {
          bestMetricScoreForCandidate = currentCombinationScore;
          bestParamsForCandidate = { ...currentCandidateParams }; 
        }
      }

      const calculatedMetricValueForCandidate = bestMetricScoreForCandidate;
      logger.verbose(`AISelectorStrategy for ${symbol}: Candidate ${candidateStrategy.id} best score using metric '${metric}': ${calculatedMetricValueForCandidate.toFixed(4)}. Optimized Params: ${optimizeParameters && bestParamsForCandidate ? JSON.stringify(bestParamsForCandidate) : "N/A"}`);
      
      if (calculatedMetricValueForCandidate > currentBestMetricValue) {
        currentBestMetricValue = calculatedMetricValueForCandidate;
        bestStrategyId = candidateStrategy.id;
        bestOverallParams = bestParamsForCandidate;
      }
    }

    if (!bestStrategyId) {
      logger.warn(`AISelectorStrategy for ${symbol}: No suitable strategy found after evaluation (metric: ${metric}, best value: ${currentBestMetricValue}). Holding.`);
      const currentBarForDecision = context.historicalData[context.currentIndex];
      lastAIDecision = {
        timestamp: currentBarForDecision.timestamp,
        date: currentBarForDecision.date ? (typeof currentBarForDecision.date === 'string' ? currentBarForDecision.date : new Date(currentBarForDecision.date).toISOString().split('T')[0]) : new Date(currentBarForDecision.timestamp * 1000).toISOString().split('T')[0],
        chosenStrategyId: null,
        chosenStrategyName: null,
        parametersUsed: null,
        evaluationScore: null,
        evaluationMetricUsed: metric,
      };
      return { action: 'HOLD' };
    }

    const finalSelectedStrategy = StrategyManagerModule.getStrategy(bestStrategyId);
    if (!finalSelectedStrategy) {
      logger.error(`AISelectorStrategy for ${symbol}: Failed to retrieve chosen strategy ${bestStrategyId} from manager. Holding.`);
      const currentBarForDecision = context.historicalData[context.currentIndex];
      lastAIDecision = {
        timestamp: currentBarForDecision.timestamp,
        date: currentBarForDecision.date ? (typeof currentBarForDecision.date === 'string' ? currentBarForDecision.date : new Date(currentBarForDecision.date).toISOString().split('T')[0]) : new Date(currentBarForDecision.timestamp*1000).toISOString().split('T')[0],
        chosenStrategyId: bestStrategyId,
        chosenStrategyName: "Error: Strategy not found in manager",
        parametersUsed: bestOverallParams,
        evaluationScore: currentBestMetricValue,
        evaluationMetricUsed: metric,
      };
      return { action: 'HOLD' };
    }
    
    logger.info(`AISelectorStrategy for ${symbol}: Chose strategy ${bestStrategyId} using metric '${metric}' with score ${currentBestMetricValue.toFixed(4)}.`);
    currentChoicesBySymbol.set(symbol, bestStrategyId);

    let paramsToStoreAndExecuteWith: Record<string, any>;
    const defaultSelectedStrategyParams: Record<string, any> = {};
    (finalSelectedStrategy.parameters || []).forEach((p: StrategyParameterDefinition) => {
        defaultSelectedStrategyParams[p.name] = p.defaultValue;
    });

    if (optimizeParameters && bestOverallParams && Object.keys(bestOverallParams).length > 0) {
        paramsToStoreAndExecuteWith = { ...defaultSelectedStrategyParams, ...bestOverallParams };
        logger.info(`AISelectorStrategy for ${symbol}: Storing OPTIMIZED params for ${bestStrategyId}: ${JSON.stringify(paramsToStoreAndExecuteWith)}`);
    } else {
        paramsToStoreAndExecuteWith = defaultSelectedStrategyParams;
        logger.info(`AISelectorStrategy for ${symbol}: Storing DEFAULT params for ${bestStrategyId} as optimization was off or yielded no improvement.`);
    }
    optimizedParamsForChoice.set(symbol, { strategyId: bestStrategyId, params: paramsToStoreAndExecuteWith });
    
    const currentBarForDecision = context.historicalData[context.currentIndex];
    lastAIDecision = {
      timestamp: currentBarForDecision.timestamp,
      date: currentBarForDecision.date ? (typeof currentBarForDecision.date === 'string' ? currentBarForDecision.date : new Date(currentBarForDecision.date).toISOString().split('T')[0]) : new Date(currentBarForDecision.timestamp*1000).toISOString().split('T')[0],
      chosenStrategyId: bestStrategyId,
      chosenStrategyName: finalSelectedStrategy.name,
      parametersUsed: paramsToStoreAndExecuteWith,
      evaluationScore: currentBestMetricValue,
      evaluationMetricUsed: metric,
    };

    const strategyContextForExecution: StrategyContext<Record<string, any>> = {
        ...context,
        parameters: paramsToStoreAndExecuteWith, 
    };
    
    logger.info(`AISelectorStrategy for ${symbol}: Executing ${finalSelectedStrategy.id} with effective parameters: ${JSON.stringify(strategyContextForExecution.parameters)}`);
    
    return finalSelectedStrategy.execute(strategyContextForExecution); 
  }
};

export interface AISelectorChoiceState {
    chosenStrategyId: string | null;
    chosenStrategyName: string | null;
    parametersUsed: Record<string, any> | null;
    message?: string;
}

export function getAISelectorActiveState(symbol: string): AISelectorChoiceState {
    const choiceData = optimizedParamsForChoice.get(symbol);
    
    if (choiceData && choiceData.strategyId) {
        const strategyDetails = StrategyManagerModule.getStrategy(choiceData.strategyId);
        return {
            chosenStrategyId: choiceData.strategyId,
            chosenStrategyName: strategyDetails ? strategyDetails.name : "Unknown Strategy",
            parametersUsed: choiceData.params,
        };
    }
    
    const chosenStrategyId = currentChoicesBySymbol.get(symbol);
    if (chosenStrategyId) {
        const strategyDetails = StrategyManagerModule.getStrategy(chosenStrategyId);
        let params: Record<string, any> | null = null;
        if (strategyDetails && strategyDetails.parameters) {
            params = {};
            strategyDetails.parameters.forEach((p: StrategyParameterDefinition) => params![p.name] = p.defaultValue);
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
