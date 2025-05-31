// src/services/aiSuggestionService.ts
import { fetchHistoricalDataFromDB } from './dataService';
import { getMostRecentClosePrice } from './dataService';
import { aiSelectorStrategy, getAISelectorActiveState } // Direct import
    from '../strategies/implementations/aiSelectorStrategy';
import * as StrategyManagerModule from '../strategies/strategyManager';
import { StrategyContext, TradingStrategy } from '../strategies/strategy.types'; // Removed StrategyParameterDefinition as it's not directly used by this service, TradingStrategy has it.
import logger from '../utils/logger';

export interface SuggestionResponse {
  suggestedStrategyId: string | null;
  suggestedStrategyName: string | null;
  suggestedParameters: Record<string, any> | null;
  recentPriceUsed?: number | null;
  message: string; // To provide context or warnings
}

interface AISelectorStrategyParams {
  evaluationLookbackPeriod: number;
  candidateStrategyIds?: string; // Comma-separated string of strategy IDs
  evaluationMetric?: 'pnl' | 'sharpe' | 'winRate' | string;
  optimizeParameters?: boolean;
}

export async function getCapitalAwareStrategySuggestion(
  symbol: string,
  initialCapital: number,
  preferredLookback?: number,
  preferredMetric?: string,
  preferredOptimizeParams?: boolean
): Promise<SuggestionResponse> {
  logger.info(`[AISuggestionService] Request for ${symbol}, capital ${initialCapital}, lookback ${preferredLookback}, metric ${preferredMetric}, optimize ${preferredOptimizeParams}`);

  const lookbackPeriod = preferredLookback || 30; // Default lookback for AI evaluation
  const bufferDaysForIndicators = 60; // Extra days to ensure indicators can be calculated for the lookback period
  const totalDaysToFetch = lookbackPeriod + bufferDaysForIndicators;

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - totalDaysToFetch);

  const aiEvalSourceApi = 'binance'; // Standardize data source for AI evaluation
  const aiEvalInterval = '1d';    // Standardize interval for AI evaluation

  let historicalDataForAI;
  try {
    historicalDataForAI = await fetchHistoricalDataFromDB(symbol, startDate, endDate, aiEvalSourceApi, aiEvalInterval);
    if (!historicalDataForAI || historicalDataForAI.length < lookbackPeriod) {
      logger.warn(`[AISuggestionService] Insufficient historical data for ${symbol} (source: ${aiEvalSourceApi}, interval: ${aiEvalInterval}). Need at least ${lookbackPeriod} points for evaluation, got ${historicalDataForAI?.length}.`);
      return {
        suggestedStrategyId: null,
        suggestedStrategyName: null,
        suggestedParameters: null,
        message: `Insufficient historical data (${historicalDataForAI?.length} points) for ${symbol} to make a reliable suggestion (requires ${lookbackPeriod} evaluation points).`
      };
    }
    logger.info(`[AISuggestionService] Fetched ${historicalDataForAI.length} data points for AI evaluation of ${symbol}.`);
  } catch (e) {
    logger.error(`[AISuggestionService] Error fetching historical data for AI suggestion for ${symbol}:`, e);
    return {
        suggestedStrategyId: null,
        suggestedStrategyName: null,
        suggestedParameters: null,
        message: "Error fetching historical data needed for generating suggestion."
    };
  }

  const aiSelectorParams: AISelectorStrategyParams = {
    evaluationLookbackPeriod: lookbackPeriod,
    candidateStrategyIds: '', // Empty means AISelectorStrategy will use all registered strategies (excluding itself)
    evaluationMetric: preferredMetric || 'sharpe', // Default to Sharpe ratio
    optimizeParameters: preferredOptimizeParams || false, // Default to not optimizing parameters during selection
  };

  // Dummy portfolio for AI context, AISelectorStrategy manages its own simulations
  const tempPortfolioForAIContext = { cash: 100000, shares: 0, initialValue: 100000, currentValue: 100000 };

  const aiContext: StrategyContext<AISelectorStrategyParams> = {
    symbol,
    historicalData: historicalDataForAI,
    currentIndex: historicalDataForAI.length - 1, // Point AI to make decision based on latest available data
    portfolio: tempPortfolioForAIContext as any, // Cast to satisfy type, AISelector uses its own sim portfolio
    tradeHistory: [], // Not strictly needed for AISelector's primary decision making
    parameters: aiSelectorParams,
  };

  try {
    // Execute AISelectorStrategy to determine the best strategy and its parameters (side effect: updates its internal state)
    await aiSelectorStrategy.execute(aiContext);

    // Retrieve the choice from AISelectorStrategy's internal state via getAISelectorActiveState
    const aiChoice = getAISelectorActiveState(symbol);

    if (!aiChoice || !aiChoice.chosenStrategyId) {
      logger.warn(`[AISuggestionService] AISelectorStrategy did not make a choice for ${symbol}. Message: ${aiChoice?.message}`);
      return {
        suggestedStrategyId: null,
        suggestedStrategyName: null,
        suggestedParameters: null,
        message: aiChoice?.message || "AI could not select a suitable strategy based on current market conditions."
      };
    }

    logger.info(`[AISuggestionService] AI choice for ${symbol}: Strategy ID '${aiChoice.chosenStrategyId}', Name '${aiChoice.chosenStrategyName}', Params:`, aiChoice.parametersUsed);

    let suggestedParameters = aiChoice.parametersUsed || {}; // These are the potentially optimized params
    const strategyDetails = StrategyManagerModule.getStrategy(aiChoice.chosenStrategyId);
    if (!strategyDetails) {
        logger.error(`[AISuggestionService] Critical: AI chose strategy ${aiChoice.chosenStrategyId}, but its details were not found in StrategyManager.`);
         return {
            suggestedStrategyId: null,
            suggestedStrategyName: null,
            suggestedParameters: null,
            message: `Internal error: Details for suggested strategy ID '${aiChoice.chosenStrategyId}' not found.`
        };
    }

    // Fetch recent price for capital adjustment using the same source/interval as AI eval for consistency
    const recentPrice = await getMostRecentClosePrice(symbol, aiEvalSourceApi, aiEvalInterval);

    if (recentPrice === null) {
      logger.warn(`[AISuggestionService] Could not fetch recent price for ${symbol} (source: ${aiEvalSourceApi}, interval: ${aiEvalInterval}). Cannot adjust tradeAmount.`);
      return {
        suggestedStrategyId: aiChoice.chosenStrategyId,
        suggestedStrategyName: strategyDetails.name, // Use name from strategyDetails for consistency
        suggestedParameters,
        recentPriceUsed: null,
        message: "Strategy suggested, but could not fetch recent price to adjust tradeAmount. Using default/optimized tradeAmount."
      };
    }
    logger.info(`[AISuggestionService] Recent price for ${symbol} is ${recentPrice}. Initial capital ${initialCapital}.`);

    const sizingParamDef = strategyDetails.parameters.find(p => p.name === 'tradeAmount' || p.name === 'sharesToTrade' || p.name === 'contracts');

    if (sizingParamDef && suggestedParameters.hasOwnProperty(sizingParamDef.name)) {
      const sizingParamName = sizingParamDef.name;
      const originalTradeAmount = Number(suggestedParameters[sizingParamName]);

      // Determine target trade value, e.g., 10-50% of capital. Make this configurable later.
      const targetTradeValueFraction = 0.20; // Use 20% of capital for a trade
      const targetTradeValue = initialCapital * targetTradeValueFraction;
      let adjustedTradeAmount = targetTradeValue / recentPrice;

      // Apply asset-specific rounding or minimums if available from strategy or global config
      // Basic rounding for now, assuming a generic number that could be shares or contracts
      // For assets like BTC, very fine precision is needed. For stocks, whole numbers.
      // This part needs significant enhancement for multi-asset support.
      if (symbol.toUpperCase().includes('BTC')) { // Highly simplified example
        adjustedTradeAmount = parseFloat(adjustedTradeAmount.toFixed(5));
        const minTradeableBTC = 0.0001;
        if (adjustedTradeAmount < minTradeableBTC) {
            if (initialCapital >= minTradeableBTC * recentPrice) {
                logger.info(`[AISuggestionService] Adjusted ${sizingParamName} ${adjustedTradeAmount} for ${symbol} is below minimum ${minTradeableBTC}, setting to minimum as capital allows.`);
                adjustedTradeAmount = minTradeableBTC;
            } else {
                logger.warn(`[AISuggestionService] Capital ${initialCapital} too low for even minimum ${sizingParamName} ${minTradeableBTC} of ${symbol} at price ${recentPrice}.`);
                return {
                    suggestedStrategyId: aiChoice.chosenStrategyId,
                    suggestedStrategyName: strategyDetails.name,
                    suggestedParameters, // Return original/optimized params before adjustment
                    recentPriceUsed: recentPrice,
                    message: `Capital ${initialCapital} is too low to trade even a minimum amount of ${symbol} at price ${recentPrice}. Original suggested parameters kept.`
                };
            }
        }
      } else { // Default for other assets (e.g., stocks - round to whole shares)
        adjustedTradeAmount = Math.floor(adjustedTradeAmount);
        if (adjustedTradeAmount < 1 && originalTradeAmount >=1 ) { // If it results in less than 1 share
             if (initialCapital >= 1 * recentPrice) { // Can afford at least 1 share
                logger.info(`[AISuggestionService] Adjusted ${sizingParamName} ${adjustedTradeAmount} for ${symbol} is less than 1, setting to 1 as capital allows.`);
                adjustedTradeAmount = 1;
             } else {
                logger.warn(`[AISuggestionService] Capital ${initialCapital} too low for even 1 share of ${symbol} at price ${recentPrice}.`);
                 return {
                    suggestedStrategyId: aiChoice.chosenStrategyId,
                    suggestedStrategyName: strategyDetails.name,
                    suggestedParameters,
                    recentPriceUsed: recentPrice,
                    message: `Capital ${initialCapital} is too low to trade even 1 unit of ${symbol} at price ${recentPrice}. Original suggested parameters kept.`
                };
             }
        } else if (adjustedTradeAmount < 1) { // Original was also < 1 or not applicable, and calculated is < 1
             logger.warn(`[AISuggestionService] Calculated ${sizingParamName} for ${symbol} is less than 1 (${adjustedTradeAmount}). This may not be tradable.`);
             // Depending on strategy, could be an issue. For now, allow it but log.
             // Some strategies might use fractional amounts for non-share assets.
        }
      }

      if (adjustedTradeAmount <= 0) {
          logger.warn(`[AISuggestionService] Adjusted ${sizingParamName} for ${symbol} is ${adjustedTradeAmount}. Capital might be too low or price too high. Keeping original/optimized parameter.`);
           return {
              suggestedStrategyId: aiChoice.chosenStrategyId,
              suggestedStrategyName: strategyDetails.name,
              suggestedParameters, // Return params before this problematic adjustment
              recentPriceUsed: recentPrice,
              message: `Calculated trade amount for ${symbol} is zero or negative. Capital may be too low for current price. Original parameters kept.`
           };
      }

      logger.info(`[AISuggestionService] For ${symbol} (capital ${initialCapital}, price ${recentPrice}): Original ${sizingParamName}: ${originalTradeAmount}, Capital-Aware Adjusted ${sizingParamName}: ${adjustedTradeAmount}`);
      suggestedParameters = { ...suggestedParameters, [sizingParamName]: adjustedTradeAmount };

      return {
        suggestedStrategyId: aiChoice.chosenStrategyId,
        suggestedStrategyName: strategyDetails.name,
        suggestedParameters,
        recentPriceUsed: recentPrice,
        message: `Strategy suggestion with ${sizingParamName} adjusted for capital ${initialCapital}.`
      };

    } else {
      logger.warn(`[AISuggestionService] Chosen strategy ${strategyDetails.name} (ID: ${aiChoice.chosenStrategyId}) does not have a standard 'tradeAmount', 'sharesToTrade', or 'contracts' parameter. Capital adjustment for trade size not applied.`);
      return {
        suggestedStrategyId: aiChoice.chosenStrategyId,
        suggestedStrategyName: strategyDetails.name,
        suggestedParameters, // Return original/optimized params
        recentPriceUsed: recentPrice,
        message: `Strategy suggested. Its parameters do not include a standard trade sizing parameter for capital adjustment.`
      };
    }
  } catch (error) {
    logger.error(`[AISuggestionService] Error during AI strategy selection or parameter adjustment for ${symbol}:`, error);
    return {
        suggestedStrategyId: null,
        suggestedStrategyName: null,
        suggestedParameters: null,
        message: "An unexpected error occurred while generating the strategy suggestion."
    };
  }
}
