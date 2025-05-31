import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
// Import the new helper function and its return type
import { getAISelectorActiveState, AISelectorChoiceState } from '../strategies/implementations/aiSelectorStrategy';
// import { StrategyManager } from '../strategies/strategyManager'; // StrategyManager is likely already imported - REMOVED
import logger from '../utils/logger'; // Corrected logger import
import { getCapitalAwareStrategySuggestion, SuggestionResponse } from '../services/aiSuggestionService';

const router = Router();

router.get('/current-strategy/:symbol', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { symbol } = req.params;

  // Explicit check for the presence of the symbol parameter in the path as per Option A
  // Also check if it's an empty string after trimming, as Express might pass an empty segment as ""
  if (!req.params.symbol || req.params.symbol.trim() === "") { 
    res.status(400).json({ message: "Symbol parameter is required." });
    return;
  }
  
  // If req.params.symbol exists and is not empty, then symbol variable will also be valid.
  const upperSymbol = symbol.toUpperCase(); 

  try {
    const aiState: AISelectorChoiceState = getAISelectorActiveState(upperSymbol);

    if (aiState.chosenStrategyId && aiState.chosenStrategyName) {
      // chosenStrategyName is already provided by getAISelectorActiveState
      const message = `AI is currently using ${aiState.chosenStrategyName} (ID: ${aiState.chosenStrategyId})${aiState.parametersUsed ? ' with specified parameters' : ' with default parameters'} for ${upperSymbol}.`;
      
      res.status(200).json({
        symbol: upperSymbol,
        chosenStrategyId: aiState.chosenStrategyId,
        chosenStrategyName: aiState.chosenStrategyName,
        chosenParameters: aiState.parametersUsed,
        message: message
      });
      return;
    } else {
      // Use message from aiState if available (e.g., "No strategy choice has been made...")
      res.status(404).json({
        symbol: upperSymbol,
        message: aiState.message || `AI choice not available for symbol ${upperSymbol}.`
      });
      return;
    }
  } catch (error) {
    logger.error(`Error fetching AI choice for symbol ${upperSymbol}:`, error);
    res.status(500).json({
        symbol: upperSymbol,
        message: "Internal server error while fetching AI strategy choice."
    });
    return;
  }
});

router.post('/suggest-strategy', (async (req: Request, res: Response, next: NextFunction) => {
  const {
    symbol,
    initialCapital,
    lookbackPeriod, // optional
    evaluationMetric, // optional
    optimizeParameters, // optional
    riskPercentage // optional
  } = req.body;

  if (!symbol || typeof symbol !== 'string' || symbol.trim() === "") {
    res.status(400).json({ message: "Symbol parameter is required and must be a non-empty string." });
    return;
  }
  if (initialCapital === undefined || typeof initialCapital !== 'number' || initialCapital <= 0) {
    res.status(400).json({ message: "Initial capital parameter is required and must be a positive number." });
    return;
  }
  // Optional: Validate optional param types if necessary (e.g., lookbackPeriod is a number)
  if (lookbackPeriod !== undefined && typeof lookbackPeriod !== 'number') {
    res.status(400).json({ message: "Optional parameter 'lookbackPeriod' must be a number." });
    return;
  }
  if (evaluationMetric !== undefined && typeof evaluationMetric !== 'string') {
    res.status(400).json({ message: "Optional parameter 'evaluationMetric' must be a string." });
    return;
  }
  if (optimizeParameters !== undefined && typeof optimizeParameters !== 'boolean') {
    res.status(400).json({ message: "Optional parameter 'optimizeParameters' must be a boolean." });
    return;
  }

  try {
    logger.info(`[API /suggest-strategy] Received request for symbol ${symbol}, capital ${initialCapital}`);
    const suggestion: SuggestionResponse = await getCapitalAwareStrategySuggestion(
      symbol,
      initialCapital,
      lookbackPeriod,
      evaluationMetric,
      optimizeParameters,
      riskPercentage // Pass it to the service
    );

    // The service function SuggestionResponse always includes a message.
    // If suggestedStrategyId is null, it means no active suggestion could be made,
    // but the operation itself didn't fail.
    res.status(200).json(suggestion);
    return;

  } catch (error: any) {
    logger.error(`[API /suggest-strategy] Internal error for symbol ${symbol}, capital ${initialCapital}:`, error);
    // Pass to a generic error handler if implemented, or return 500
    // Ensure NextFunction (next) is called if it's an unhandled error meant for middleware
    // For now, directly return 500.
    res.status(500).json({ message: "Internal server error while generating strategy suggestion.", error: error.message });
    return;
  }
}) as RequestHandler);

export default router;
