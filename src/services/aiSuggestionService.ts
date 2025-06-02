// src/services/aiSuggestionService.ts
import { logSafeError } from '../utils/safeLogger';
import { fetchHistoricalDataFromDB } from './dataService';
import { getMostRecentClosePrice } from './dataService'; // Will be used later
import { getAllUniqueSymbols } from '../database'; // Added import
import { aiSelectorStrategy, getAISelectorActiveState } // Direct import
    from '../strategies/implementations/aiSelectorStrategy';
import * as StrategyManagerModule from '../strategies/strategyManager';
import { StrategyContext, TradingStrategy } from '../strategies/strategy.types';
import logger from '../utils/logger';

export interface SuggestionResponse {
  symbol: string; // Added field for the symbol
  suggestedStrategyId: string | null;
  suggestedStrategyName: string | null;
  suggestedParameters: Record<string, any> | null;
  recentPriceUsed?: number | null;
  evaluationScore?: number | null; // Added
  evaluationMetricUsed?: string | null; // Added
  message: string; // To provide context or warnings
}

interface AISelectorStrategyParams {
  evaluationLookbackPeriod: number;
  candidateStrategyIds?: string; // Comma-separated string of strategy IDs
  evaluationMetric?: 'pnl' | 'sharpe' | 'winRate' | string;
  optimizeParameters?: boolean;
}

export async function getCapitalAwareStrategySuggestion(
  symbolInput: string, // Will be ignored for symbol selection, but kept for API compatibility for now
  initialCapital: number,
  preferredLookback?: number,
  preferredMetricForSelector?: string, // Renamed for clarity
  preferredOptimizeParams?: boolean,
  preferredRiskPercentage?: number,
  overallSelectionMetricInput?: string // <-- New parameter
): Promise<SuggestionResponse[]> {

  const allSymbols = getAllUniqueSymbols();
  logger.info(`[AISuggestionService] Found ${allSymbols.length} unique symbols in the database for analysis.`);
  if (allSymbols.length === 0) {
    // Return an empty array if no symbols are available
    return [];
  }

  const riskPercentage = (preferredRiskPercentage !== undefined && preferredRiskPercentage >= 1 && preferredRiskPercentage <= 100)
    ? preferredRiskPercentage
    : 20;

  const lookbackPeriod = preferredLookback || 30;
  const bufferDaysForIndicators = 60;
  const totalDaysToFetch = lookbackPeriod + bufferDaysForIndicators;
  const aiEvalSourceApi = 'binance';
  const aiEvalInterval = '1d';

  const validSelectorMetrics = ['pnl', 'sharpe', 'winRate'];
  const chosenSelectorMetric = (preferredMetricForSelector && validSelectorMetrics.includes(preferredMetricForSelector.toLowerCase()))
    ? preferredMetricForSelector.toLowerCase()
    : 'pnl'; // Default AISelector's internal metric to 'pnl'

  const validOverallMetrics = ['pnl', 'sharpe', 'winRate'];
  const overallSelectionMetric: 'pnl' | 'sharpe' | 'winRate' =
    (overallSelectionMetricInput && validOverallMetrics.includes(overallSelectionMetricInput.toLowerCase()))
    ? overallSelectionMetricInput.toLowerCase() as 'pnl' | 'sharpe' | 'winRate'
    : 'pnl'; // Default overall selection to 'pnl'

  logger.info(`[AISuggestionService] Global settings: Capital ${initialCapital}, Lookback ${lookbackPeriod}, AISelector Metric ${chosenSelectorMetric}, Optimize ${preferredOptimizeParams}, Risk % ${riskPercentage}, Overall Selection Metric: ${overallSelectionMetric}`);

  const allSymbolResults = [];

  for (const currentSymbol of allSymbols) {
    logger.info(`[AISuggestionService] Starting analysis for symbol: ${currentSymbol}`);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - totalDaysToFetch);

    let historicalDataForAI;
    try {
      historicalDataForAI = await fetchHistoricalDataFromDB(currentSymbol, startDate, endDate, aiEvalSourceApi, aiEvalInterval);
      if (!historicalDataForAI || historicalDataForAI.length < lookbackPeriod) {
        logger.warn(`[AISuggestionService] Insufficient historical data for ${currentSymbol} (source: ${aiEvalSourceApi}, interval: ${aiEvalInterval}). Need ${lookbackPeriod}, got ${historicalDataForAI?.length}. Skipping.`);
        continue;
      }
      logger.info(`[AISuggestionService] Fetched ${historicalDataForAI.length} data points for AI evaluation of ${currentSymbol}.`);
    } catch (e) {
      logSafeError(logger, `[AISuggestionService] Error fetching historical data for AI suggestion for ${currentSymbol}`, e, { symbol: currentSymbol });
      continue;
    }

    const aiSelectorParams: AISelectorStrategyParams = {
      evaluationLookbackPeriod: lookbackPeriod,
      candidateStrategyIds: '',
      evaluationMetric: chosenSelectorMetric, // Use the determined metric for AISelector
      optimizeParameters: preferredOptimizeParams || false,
    };

    const tempPortfolioForAIContext = { cash: 100000, shares: 0, initialValue: 100000, currentValue: 100000 };
    const aiContext: StrategyContext<AISelectorStrategyParams> = {
      symbol: currentSymbol,
      historicalData: historicalDataForAI,
      currentIndex: historicalDataForAI.length - 1,
      portfolio: tempPortfolioForAIContext as any,
      tradeHistory: [],
      parameters: aiSelectorParams,
    };

    try {
      await aiSelectorStrategy.execute(aiContext);
      const aiChoice = getAISelectorActiveState(currentSymbol);

      // Add conditional log for when AISelectorStrategy doesn't yield a chosen strategy
      if (!aiChoice || !aiChoice.chosenStrategyId) {
        logger.warn(`[AISuggestionService] For symbol ${currentSymbol}, AISelectorStrategy did not yield a chosen strategy. Raw aiChoice object: ${JSON.stringify(aiChoice)}`);
      }

      if (aiChoice && aiChoice.chosenStrategyId) {
        const strategyDetails = StrategyManagerModule.getStrategy(aiChoice.chosenStrategyId);
        if (strategyDetails) {
          allSymbolResults.push({
            symbol: currentSymbol,
            strategyId: aiChoice.chosenStrategyId!,
            strategyName: strategyDetails.name,
            parameters: aiChoice.parametersUsed || {},
            evaluationScore: aiChoice.evaluationScore,    // Primary score
            evaluationMetric: aiChoice.evaluationMetricUsed, // Primary metric
            simulatedPnl: aiChoice.simulatedPnl,
            simulatedSharpe: aiChoice.simulatedSharpe,     // <-- Add/ensure this
            simulatedWinRate: aiChoice.simulatedWinRate,   // <-- Add/ensure this
          });
          logger.info(`[AISuggestionService] Best strategy for ${currentSymbol}: ${strategyDetails.name} (ID: ${aiChoice.chosenStrategyId}), ` +
                      `Metric: ${aiChoice.evaluationMetricUsed}, Score: ${aiChoice.evaluationScore?.toFixed(4)}, ` +
                      `P&L: ${aiChoice.simulatedPnl?.toFixed(2)}, Sharpe: ${aiChoice.simulatedSharpe?.toFixed(2)}, WinRate: ${(aiChoice.simulatedWinRate !== undefined && aiChoice.simulatedWinRate !== null ? (aiChoice.simulatedWinRate * 100).toFixed(1) + '%' : 'N/A')}`);
        } else {
          logger.warn(`[AISuggestionService] AI chose strategy ${aiChoice.chosenStrategyId} for ${currentSymbol}, but details not found in StrategyManager.`);
        }
      } else {
        logger.warn(`[AISuggestionService] AISelectorStrategy did not make a choice for ${currentSymbol}. Message: ${aiChoice?.message}`);
      }
    } catch (error) {
      logSafeError(logger, `[AISuggestionService] Error during AI strategy selection for ${currentSymbol}`, error, { symbol: currentSymbol });
      continue;
    }
  } // End of for...of allSymbols loop

  if (allSymbolResults.length === 0) {
    // Return an empty array if no suitable strategy could be determined
    logger.info("[AISuggestionService] No suitable strategy could be determined for any symbol after full analysis.");
    return [];
  }

  logger.info(`[AISuggestionService] Collected ${allSymbolResults.length} best-per-symbol results. Now sorting and selecting top N based on metric: ${overallSelectionMetric}.`);

  // Sorting logic
  allSymbolResults.sort((a, b) => {
    let scoreA: number | null | undefined;
    let scoreB: number | null | undefined;

    if (overallSelectionMetric === 'pnl') {
      scoreA = a.simulatedPnl;
      scoreB = b.simulatedPnl;
    } else if (overallSelectionMetric === 'sharpe') {
      scoreA = a.simulatedSharpe;
      scoreB = b.simulatedSharpe;
    } else { // winRate
      scoreA = a.simulatedWinRate;
      scoreB = b.simulatedWinRate;
    }

    // Handle null/undefined: sort them to the bottom
    if (scoreA == null || !isFinite(scoreA)) return 1; // a is worse
    if (scoreB == null || !isFinite(scoreB)) return -1; // b is worse

    return scoreB - scoreA; // Descending order
  });

  const topNValue = 3; // Define N for Top N
  const topNResults = allSymbolResults.slice(0, topNValue);

  if (topNResults.length === 0) {
    logger.warn(`[AISuggestionService] No valid results after sorting for metric '${overallSelectionMetric}'.`);
    return [];
  }

  logger.info(`[AISuggestionService] Top ${topNResults.length} results selected:`);
  topNResults.forEach((result, index) => {
    logger.info(`  ${index + 1}. Symbol: ${result.symbol}, Strategy: ${result.strategyName}, Metric (${overallSelectionMetric}): ${
      overallSelectionMetric === 'pnl' ? result.simulatedPnl?.toFixed(2) :
      overallSelectionMetric === 'sharpe' ? result.simulatedSharpe?.toFixed(2) :
      (result.simulatedWinRate !== undefined && result.simulatedWinRate !== null ? (result.simulatedWinRate * 100).toFixed(1) + '%' : 'N/A')
    }, P&L: ${result.simulatedPnl?.toFixed(2)}, Sharpe: ${result.simulatedSharpe?.toFixed(2)}, WinRate: ${(result.simulatedWinRate !== undefined && result.simulatedWinRate !== null ? (result.simulatedWinRate * 100).toFixed(1) + '%' : 'N/A')}`);
  });

  const finalSuggestions: SuggestionResponse[] = [];

  for (const result of topNResults) {
    const symbolForAdjustment = result.symbol;
    let parametersForAdjustment = { ...result.parameters };
    let currentOverallScore: number | undefined | null;
    if (overallSelectionMetric === 'pnl') currentOverallScore = result.simulatedPnl;
    else if (overallSelectionMetric === 'sharpe') currentOverallScore = result.simulatedSharpe;
    else currentOverallScore = result.simulatedWinRate;


    let message = `Suggestion for ${symbolForAdjustment} (selected by ${overallSelectionMetric}): ${result.strategyName}. ` +
                  `Score on ${overallSelectionMetric}: ${(typeof currentOverallScore === 'number' ? currentOverallScore.toFixed(4) : 'N/A')}. ` +
                  `P&L: ${result.simulatedPnl?.toFixed(2)}, Sharpe: ${result.simulatedSharpe?.toFixed(2)}, WinRate: ${(result.simulatedWinRate !== undefined && result.simulatedWinRate !== null ? (result.simulatedWinRate * 100).toFixed(1) + '%' : 'N/A')}.`;

    const recentPrice = await getMostRecentClosePrice(symbolForAdjustment, aiEvalSourceApi, aiEvalInterval);

    if (recentPrice === null) {
      logger.warn(`[AISuggestionService] Could not fetch recent price for ${symbolForAdjustment} (source: ${aiEvalSourceApi}, interval: ${aiEvalInterval}). Cannot adjust tradeAmount.`);
      message += " Failed to fetch recent price; tradeAmount not adjusted.";
    } else {
      logger.info(`[AISuggestionService] Recent price for ${symbolForAdjustment} is ${recentPrice}. Initial capital ${initialCapital}. Adjusting tradeAmount for this suggestion.`);
      const strategyDetails = StrategyManagerModule.getStrategy(result.strategyId);

      if (!strategyDetails) {
        logger.error(`[AISuggestionService] Critical: Strategy details for ${result.strategyId} not found for symbol ${symbolForAdjustment}. Cannot perform capital adjustment.`);
        message += " Internal error: Strategy details not found; tradeAmount not adjusted.";
      } else {
        const sizingParamDef = strategyDetails.parameters.find(p => p.name === 'tradeAmount' || p.name === 'sharesToTrade' || p.name === 'contracts');
        if (sizingParamDef && parametersForAdjustment.hasOwnProperty(sizingParamDef.name)) {
          const sizingParamName = sizingParamDef.name;
          const originalTradeAmount = Number(parametersForAdjustment[sizingParamName]);
          const targetTradeValue = initialCapital * (riskPercentage / 100.0);
          let adjustedTradeAmount = targetTradeValue / recentPrice;

          if (symbolForAdjustment.toUpperCase().includes('BTC')) {
            adjustedTradeAmount = parseFloat(adjustedTradeAmount.toFixed(5));
            const minTradeableBTC = 0.0001; // Example minimum
            if (adjustedTradeAmount < minTradeableBTC) {
              if (initialCapital >= minTradeableBTC * recentPrice) {
                logger.info(`[AISuggestionService] Adjusted ${sizingParamName} ${adjustedTradeAmount} for ${symbolForAdjustment} is below minimum ${minTradeableBTC}, setting to minimum as capital allows.`);
                adjustedTradeAmount = minTradeableBTC;
              } else {
                logger.warn(`[AISuggestionService] Capital ${initialCapital} too low for even minimum ${sizingParamName} ${minTradeableBTC} of ${symbolForAdjustment} at price ${recentPrice}. Using original param value ${originalTradeAmount}.`);
                message += ` Capital too low for min trade of ${minTradeableBTC} ${symbolForAdjustment}; ${sizingParamName} not adjusted from ${originalTradeAmount}.`;
                adjustedTradeAmount = originalTradeAmount; // Revert
              }
            }
          } else { // Default for other assets
            adjustedTradeAmount = Math.floor(adjustedTradeAmount);
            if (adjustedTradeAmount < 1) {
              if (initialCapital >= 1 * recentPrice) { // Can afford at least 1 unit
                logger.info(`[AISuggestionService] Adjusted ${sizingParamName} ${adjustedTradeAmount} for ${symbolForAdjustment} is less than 1, setting to 1 as capital allows.`);
                adjustedTradeAmount = 1;
              } else {
                logger.warn(`[AISuggestionService] Capital ${initialCapital} too low for even 1 unit of ${symbolForAdjustment} at price ${recentPrice}. Using original param value ${originalTradeAmount}.`);
                message += ` Capital too low for 1 unit of ${symbolForAdjustment}; ${sizingParamName} not adjusted from ${originalTradeAmount}.`;
                adjustedTradeAmount = originalTradeAmount; // Revert
              }
            }
          }

          if (adjustedTradeAmount <= 0 && originalTradeAmount > 0) {
            logger.warn(`[AISuggestionService] Adjusted ${sizingParamName} for ${symbolForAdjustment} is ${adjustedTradeAmount}. Capital might be too low. Reverting to original parameter value ${originalTradeAmount}.`);
            parametersForAdjustment[sizingParamName] = originalTradeAmount;
            message += ` Calculated ${sizingParamName} was ${adjustedTradeAmount}; reverted to original ${originalTradeAmount}.`;
          } else if (adjustedTradeAmount > 0) {
            logger.info(`[AISuggestionService] For ${symbolForAdjustment} (capital ${initialCapital}, price ${recentPrice}): Original ${sizingParamName}: ${originalTradeAmount}, Capital-Aware Adjusted ${sizingParamName}: ${adjustedTradeAmount}`);
            parametersForAdjustment[sizingParamName] = adjustedTradeAmount;
            message += ` ${sizingParamName} adjusted to ${adjustedTradeAmount} for capital ${initialCapital}€, risk ${riskPercentage}%.`;
          } else {
            logger.info(`[AISuggestionService] Original and Adjusted ${sizingParamName} for ${symbolForAdjustment} are non-positive (${originalTradeAmount} -> ${adjustedTradeAmount}). No change to ${sizingParamName}.`);
            message += ` ${sizingParamName} remains ${originalTradeAmount} (non-positive).`;
          }

        } else {
          logger.warn(`[AISuggestionService] Chosen strategy ${strategyDetails.name} (ID: ${result.strategyId}) for ${symbolForAdjustment} does not have a standard sizing parameter or it's missing. Capital adjustment not applied.`);
          message += " No standard trade sizing parameter found; tradeAmount not adjusted.";
        }
      }
    }

    finalSuggestions.push({
      symbol: result.symbol, // Added symbol to the response object
      suggestedStrategyId: result.strategyId,
      suggestedStrategyName: result.strategyName,
      suggestedParameters: parametersForAdjustment,
      evaluationScore: (typeof currentOverallScore === 'number' ? parseFloat(currentOverallScore.toFixed(4)) : null),
      evaluationMetricUsed: overallSelectionMetric,
      recentPriceUsed: recentPrice,
      message: message
    });
  }

  return finalSuggestions;
}
