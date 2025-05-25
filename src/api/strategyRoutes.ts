// In src/api/strategyRoutes.ts
import express, { Request, Response, Router } from 'express';
import { getAvailableStrategies } from '../strategies'; // Adjusted path
import { runBacktest, BacktestResult } from '../backtest';   // Adjusted path
import { logger } from '../utils/logger';

const router: Router = express.Router();

// --- GET /api/strategies ---
router.get('/strategies', (req: Request, res: Response) => {
  try {
    logger.info('API call to GET /strategies');
    const strategies = getAvailableStrategies();
    // We only want to expose fields relevant for selection and parameterization to the UI
    const strategiesForUI = strategies.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      parameters: s.parameters, // Frontend will need parameter definitions
    }));
    res.json(strategiesForUI);
  } catch (error) {
    logger.error('Error in GET /strategies:', error);
    res.status(500).json({ message: 'Error fetching strategies', error: (error as Error).message });
  }
});

// --- POST /api/backtest ---
interface BacktestRequestBody {
  strategyId: string;
  strategyParams: Record<string, number | string | boolean>;
  symbol: string;
  startDate: string; // ISO date string
  endDate: string;   // ISO date string
  initialCash: number;
  sourceApi?: string;
  interval?: string;
}

router.post('/backtest', async (req: Request, res: Response) => {
  try {
    const body = req.body as BacktestRequestBody;
    logger.info('API call to POST /backtest with body:', { 
      strategyId: body.strategyId, 
      symbol: body.symbol, 
      startDate: body.startDate, 
      endDate: body.endDate,
      // Log params separately if too verbose or sensitive
      // strategyParams: body.strategyParams 
    });

    // Basic Input Validation
    const requiredFields: Array<keyof BacktestRequestBody> = ['strategyId', 'strategyParams', 'symbol', 'startDate', 'endDate', 'initialCash'];
    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || (typeof body[field] === 'string' && (body[field] as string).trim() === '')) {
        logger.warn(`POST /backtest validation error: Missing required field: ${field}`, { body });
        return res.status(400).json({ message: `Missing required field: ${field}` });
      }
    }
    
    if (typeof body.initialCash !== 'number' || body.initialCash <= 0) {
        logger.warn(`POST /backtest validation error: initialCash must be a positive number.`, { initialCash: body.initialCash });
        return res.status(400).json({ message: 'initialCash must be a positive number.' });
    }

    const startDateObj = new Date(body.startDate);
    const endDateObj = new Date(body.endDate);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      logger.warn(`POST /backtest validation error: Invalid date format for startDate or endDate.`, { startDate: body.startDate, endDate: body.endDate });
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    if (endDateObj <= startDateObj) {
        logger.warn(`POST /backtest validation error: endDate must be after startDate.`, { startDate: body.startDate, endDate: body.endDate });
        return res.status(400).json({ message: 'endDate must be after startDate.' });
    }

    // Call runBacktest
    logger.info(`Executing runBacktest for strategy: ${body.strategyId}, symbol: ${body.symbol}`);
    const result: BacktestResult = await runBacktest(
      body.symbol,
      startDateObj,
      endDateObj,
      body.initialCash,
      body.strategyId,
      body.strategyParams,
      body.sourceApi,
      body.interval
    );

    logger.info(`runBacktest completed for strategy: ${body.strategyId}, symbol: ${body.symbol}. Sending result.`);
    res.json(result);

  } catch (error) {
    logger.error('Error in POST /backtest:', error);
    // Check if the error is from runBacktest (e.g., strategy not found) or other unexpected error
    if (error instanceof Error && error.message.includes('Strategy with ID')) { // Specific error from runBacktest if strategy not found
        return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error running backtest', error: (error as Error).message });
  }
});

export default router;
