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
  symbolInput: string, // Original symbol parameter, will be overridden by loop
  initialCapital: number,
  preferredLookback?: number,
  preferredMetric?: string,
  preferredOptimizeParams?: boolean,
  preferredRiskPercentage?: number
): Promise<SuggestionResponse> {

  const allSymbols = getAllUniqueSymbols();
  logger.info(`[AISuggestionService] Found ${allSymbols.length} unique symbols in the database for analysis.`);
  if (allSymbols.length === 0) {
    return {
      suggestedStrategyId: null,
      suggestedStrategyName: null,
      suggestedParameters: null,
      message: "Aucun symbole disponible dans la base de données pour l'analyse."
    };
  }

  const riskPercentage = (preferredRiskPercentage !== undefined && preferredRiskPercentage >= 1 && preferredRiskPercentage <= 100)
    ? preferredRiskPercentage
    : 20;

  const lookbackPeriod = preferredLookback || 30;
  const bufferDaysForIndicators = 60;
  const totalDaysToFetch = lookbackPeriod + bufferDaysForIndicators;
  const aiEvalSourceApi = 'binance';
  const aiEvalInterval = '1d';

  const validMetrics = ['pnl', 'sharpe', 'winRate'];
  const chosenEvaluationMetric = (preferredMetric && validMetrics.includes(preferredMetric)) ? preferredMetric : 'pnl'; // Default to 'pnl'

  logger.info(`[AISuggestionService] Global settings: Capital ${initialCapital}, Lookback ${lookbackPeriod}, Metric ${chosenEvaluationMetric}, Optimize ${preferredOptimizeParams}, Risk % ${riskPercentage}`);

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
      evaluationMetric: chosenEvaluationMetric,
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

      if (aiChoice && aiChoice.chosenStrategyId) {
        const strategyDetails = StrategyManagerModule.getStrategy(aiChoice.chosenStrategyId);
        if (strategyDetails) {
          allSymbolResults.push({
            symbol: currentSymbol,
            strategyId: aiChoice.chosenStrategyId!, // We know chosenStrategyId is not null here
            strategyName: strategyDetails.name,
            parameters: aiChoice.parametersUsed || {},
            evaluationScore: aiChoice.evaluationScore, // Score for the metric used by AISelector
            evaluationMetric: aiChoice.evaluationMetricUsed, // The metric used by AISelector
            simulatedPnl: aiChoice.simulatedPnl, // <-- Add this explicitly captured P&L
          });
          logger.info(`[AISuggestionService] Best strategy for ${currentSymbol}: ${strategyDetails.name} (ID: ${aiChoice.chosenStrategyId}), Metric: ${aiChoice.evaluationMetricUsed}, Score: ${aiChoice.evaluationScore?.toFixed(4)}, P&L: ${aiChoice.simulatedPnl?.toFixed(2)}`);
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
    return {
      suggestedStrategyId: null,
      suggestedStrategyName: null,
      suggestedParameters: null,
      message: "No suitable strategy could be determined for any symbol after full analysis."
    };
  }

  logger.info(`[AISuggestionService] Collected ${allSymbolResults.length} best-per-symbol results. Now determining overall best based on P&L.`);

  let overallBestResult: any = null; // Consider defining a type for elements in allSymbolResults
  let maxPnl = -Infinity;

  for (const result of allSymbolResults) {
    if (typeof result.simulatedPnl === 'number' && result.simulatedPnl > maxPnl) {
      maxPnl = result.simulatedPnl;
      overallBestResult = result;
    }
  }

  if (!overallBestResult) {
    logger.warn("[AISuggestionService] No valid P&L scores found among per-symbol results to determine an overall best, or all P&Ls were negative/zero.");
    return {
        suggestedStrategyId: null,
        suggestedStrategyName: null,
        suggestedParameters: null,
        message: "Could not determine an overall best strategy based on P&L scores across all symbols."
    };
  }

  logger.info(`[AISuggestionService] Overall best choice: Symbol ${overallBestResult.symbol}, Strategy ${overallBestResult.strategyName} (ID: ${overallBestResult.strategyId}) with P&L ${overallBestResult.simulatedPnl?.toFixed(2)} (Original metric: ${overallBestResult.evaluationMetric}, Score: ${overallBestResult.evaluationScore?.toFixed(4)})`);

  const symbolForAdjustment = overallBestResult.symbol;
  let parametersForAdjustment = { ...overallBestResult.parameters };
  let finalMessage = `Overall best for ${symbolForAdjustment}: ${overallBestResult.strategyName} (P&L: ${overallBestResult.simulatedPnl?.toFixed(2)}).`;

  const recentPrice = await getMostRecentClosePrice(symbolForAdjustment, aiEvalSourceApi, aiEvalInterval);

  if (recentPrice === null) {
    logger.warn(`[AISuggestionService] Could not fetch recent price for selected symbol ${symbolForAdjustment} (source: ${aiEvalSourceApi}, interval: ${aiEvalInterval}). Cannot adjust tradeAmount.`);
    finalMessage += " Failed to fetch recent price; tradeAmount not adjusted.";
  } else {
    logger.info(`[AISuggestionService] Recent price for ${symbolForAdjustment} is ${recentPrice}. Initial capital ${initialCapital}. Adjusting tradeAmount.`);
    const strategyDetails = StrategyManagerModule.getStrategy(overallBestResult.strategyId);

    if (!strategyDetails) {
      logger.error(`[AISuggestionService] Critical: Strategy details for ${overallBestResult.strategyId} not found. Cannot perform capital adjustment.`);
      finalMessage += " Internal error: Strategy details not found; tradeAmount not adjusted.";
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
              logger.warn(`[AISuggestionService] Capital ${initialCapital} too low for even minimum ${sizingParamName} ${minTradeableBTC} of ${symbolForAdjustment} at price ${recentPrice}. Using original param value.`);
              // Keep originalTradeAmount, don't change parametersForAdjustment[sizingParamName]
              finalMessage += ` Capital too low for min trade of ${minTradeableBTC} ${symbolForAdjustment}; ${sizingParamName} not adjusted from ${originalTradeAmount}.`;
              adjustedTradeAmount = originalTradeAmount; // Revert to original if cannot meet min
            }
          }
        } else { // Default for other assets (e.g., stocks - round to whole shares)
          adjustedTradeAmount = Math.floor(adjustedTradeAmount);
          if (adjustedTradeAmount < 1) {
            if (initialCapital >= 1 * recentPrice) { // Can afford at least 1 unit
              logger.info(`[AISuggestionService] Adjusted ${sizingParamName} ${adjustedTradeAmount} for ${symbolForAdjustment} is less than 1, setting to 1 as capital allows.`);
              adjustedTradeAmount = 1;
            } else {
              logger.warn(`[AISuggestionService] Capital ${initialCapital} too low for even 1 unit of ${symbolForAdjustment} at price ${recentPrice}. Using original param value.`);
              finalMessage += ` Capital too low for 1 unit of ${symbolForAdjustment}; ${sizingParamName} not adjusted from ${originalTradeAmount}.`;
              adjustedTradeAmount = originalTradeAmount; // Revert
            }
          }
        }

        if (adjustedTradeAmount <= 0 && originalTradeAmount > 0) { // Check if adjustment made it non-positive
            logger.warn(`[AISuggestionService] Adjusted ${sizingParamName} for ${symbolForAdjustment} is ${adjustedTradeAmount}. Capital might be too low. Reverting to original parameter value ${originalTradeAmount}.`);
            parametersForAdjustment[sizingParamName] = originalTradeAmount; // Revert to original
            finalMessage += ` Calculated ${sizingParamName} was ${adjustedTradeAmount}; reverted to original ${originalTradeAmount}.`;
        } else if (adjustedTradeAmount > 0) {
            logger.info(`[AISuggestionService] For ${symbolForAdjustment} (capital ${initialCapital}, price ${recentPrice}): Original ${sizingParamName}: ${originalTradeAmount}, Capital-Aware Adjusted ${sizingParamName}: ${adjustedTradeAmount}`);
            parametersForAdjustment[sizingParamName] = adjustedTradeAmount;
            finalMessage += ` ${sizingParamName} adjusted to ${adjustedTradeAmount} for capital ${initialCapital}€, risk ${riskPercentage}%.`;
        } else {
             // If originalTradeAmount was already 0 or less, and adjusted is also 0 or less.
            logger.info(`[AISuggestionService] Original and Adjusted ${sizingParamName} for ${symbolForAdjustment} are non-positive (${originalTradeAmount} -> ${adjustedTradeAmount}). No adjustment made.`);
            finalMessage += ` ${sizingParamName} remains ${originalTradeAmount} (non-positive).`;
        }

      } else {
        logger.warn(`[AISuggestionService] Chosen strategy ${strategyDetails.name} (ID: ${overallBestResult.strategyId}) does not have a standard sizing parameter or it's missing from current params. Capital adjustment not applied.`);
        finalMessage += " No standard trade sizing parameter found; tradeAmount not adjusted.";
      }
    }
  }

  return {
    suggestedStrategyId: overallBestResult.strategyId,
    suggestedStrategyName: overallBestResult.strategyName,
    suggestedParameters: parametersForAdjustment,
    evaluationScore: overallBestResult.evaluationScore,
    evaluationMetricUsed: overallBestResult.evaluationMetric,
    recentPriceUsed: recentPrice,
    message: finalMessage
  };
}
