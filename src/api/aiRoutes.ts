import { Router, Request, Response, NextFunction } from 'express';
// Import the new helper function and its return type
import { getAISelectorActiveState, AISelectorChoiceState } from '../strategies/implementations/aiSelectorStrategy';
// import { StrategyManager } from '../strategies/strategyManager'; // StrategyManager is likely already imported - REMOVED
import logger from '../utils/logger'; // Corrected logger import

const router = Router();

router.get('/current-strategy/:symbol', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { symbol } = req.params;
  const upperSymbol = symbol ? symbol.toUpperCase() : "";

  if (!upperSymbol) {
    res.status(400).json({ message: "Symbol parameter is required." });
    return;
  }

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

export default router;
