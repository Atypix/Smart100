import { Router, Request, Response } from 'express';
import { getAISelectorChoices } from '../strategies/implementations/aiSelectorStrategy';
import { StrategyManager } from '../strategies/strategyManager';
import { logger } from '../utils/logger';

const router = Router();

router.get('/current-strategy/:symbol', (req: Request, res: Response) => {
  const { symbol } = req.params;

  if (!symbol) {
    return res.status(400).json({ message: "Symbol parameter is required." });
  }

  try {
    const choicesMap = getAISelectorChoices(); // This gets the whole map
    const chosenStrategyId = choicesMap.get(symbol.toUpperCase());

    if (chosenStrategyId) {
      const strategyDetails = StrategyManager.getStrategy(chosenStrategyId);
      const strategyName = strategyDetails ? strategyDetails.name : "Unknown Strategy";

      return res.status(200).json({
        symbol: symbol.toUpperCase(),
        chosenStrategyId: chosenStrategyId,
        chosenStrategyName: strategyName,
        message: `AI is currently using ${strategyName} (ID: ${chosenStrategyId}) for ${symbol.toUpperCase()}.`
      });
    } else {
      return res.status(404).json({
        symbol: symbol.toUpperCase(),
        message: `AI choice not available for symbol ${symbol.toUpperCase()}. AISelectorStrategy may not have been executed for this symbol yet.`
      });
    }
  } catch (error) {
    logger.error(`Error fetching AI choice for symbol ${symbol}:`, error);
    return res.status(500).json({
        symbol: symbol.toUpperCase(),
        message: "Internal server error while fetching AI strategy choice."
    });
  }
});

export default router;
