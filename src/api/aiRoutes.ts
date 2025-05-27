import { Router, Request, Response } from 'express';
// Import the new helper function and its return type
import { getAISelectorActiveState, AISelectorChoiceState } from '../strategies/implementations/aiSelectorStrategy';
import { StrategyManager } from '../strategies/strategyManager'; // StrategyManager is likely already imported
import { logger } from '../utils/logger';

const router = Router();

router.get('/current-strategy/:symbol', (req: Request, res: Response) => {
  const { symbol } = req.params;
  const upperSymbol = symbol ? symbol.toUpperCase() : "";

  if (!upperSymbol) {
    return res.status(400).json({ message: "Symbol parameter is required." });
  }

  try {
    const aiState: AISelectorChoiceState = getAISelectorActiveState(upperSymbol);

    if (aiState.chosenStrategyId && aiState.chosenStrategyName) {
      // chosenStrategyName is already provided by getAISelectorActiveState
      const message = `AI is currently using ${aiState.chosenStrategyName} (ID: ${aiState.chosenStrategyId})${aiState.parametersUsed ? ' with specified parameters' : ' with default parameters'} for ${upperSymbol}.`;
      
      return res.status(200).json({
        symbol: upperSymbol,
        chosenStrategyId: aiState.chosenStrategyId,
        chosenStrategyName: aiState.chosenStrategyName,
        chosenParameters: aiState.parametersUsed,
        message: message
      });
    } else {
      // Use message from aiState if available (e.g., "No strategy choice has been made...")
      return res.status(404).json({
        symbol: upperSymbol,
        message: aiState.message || `AI choice not available for symbol ${upperSymbol}.`
      });
    }
  } catch (error) {
    logger.error(`Error fetching AI choice for symbol ${upperSymbol}:`, error);
    return res.status(500).json({
        symbol: upperSymbol,
        message: "Internal server error while fetching AI strategy choice."
    });
  }
});

export default router;
