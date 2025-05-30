// src/api/backtestRoutes.ts
import { Router, Request, Response } from 'express';
import { runBacktest } from '../backtest/index'; // Corrected path
import logger from '../utils/logger'; // Corrected path
import type {
    BacktestSettingsAPI,
    TradingStrategyParameters,
    BacktestResultAPI,
    Trade as APITrade, // Alias for API type
    HistoricalDataPoint as APIHistoricalDataPoint, // Alias for API type
    AIDecision as APIAIDecision // Alias for API type
} from '../types'; // Corrected path

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const {
    strategyId,
    strategyParams,
    symbol,
    startDate: startDateString, // Renamed to avoid confusion
    endDate: endDateString,     // Renamed to avoid confusion
    initialCash,
    sourceApi, // Optional
    interval,  // Optional
  } = req.body as BacktestSettingsAPI;

  // Basic validation
  if (!strategyId || !strategyParams || !symbol || !startDateString || !endDateString || initialCash === undefined) {
    logger.warn('Backtest API: Missing required fields in request body', { body: req.body });
    return res.status(400).json({ message: 'Missing required fields: strategyId, strategyParams, symbol, startDate, endDate, initialCash are required.' });
  }

  // Validate date formats (simple check, can be more robust)
  if (isNaN(new Date(startDateString).getTime()) || isNaN(new Date(endDateString).getTime())) {
      logger.warn('Backtest API: Invalid date format provided.', { startDate: startDateString, endDate: endDateString });
      return res.status(400).json({ message: 'Invalid date format. Please use YYYY-MM-DD or ISO string.' });
  }

  // Validate endDate is after startDate
  if (new Date(endDateString) <= new Date(startDateString)) {
      logger.warn('Backtest API: endDate must be after startDate.', { startDate: startDateString, endDate: endDateString });
      return res.status(400).json({ message: 'End date must be after start date.' });
  }


  logger.info(`Backtest API: Received request for strategy ${strategyId} on ${symbol}`);
  logger.debug('Backtest API: Request body:', req.body);

  try {
    const startDateObj = new Date(startDateString);
    const endDateObj = new Date(endDateString);

    // Assuming runBacktest now expects Date objects for startDate and endDate
    // and its result (BacktestResult) has Date objects for relevant date fields.
    const backtestResultInternal = await runBacktest(
      symbol,
      startDateObj, // Pass Date object
      endDateObj,     // Pass Date object
      initialCash,
      strategyId,
      strategyParams,
      sourceApi,
      interval,
    );

    // Convert Date objects in the internal result to ISO strings for the API response,
    // conforming to BacktestResultAPI.
    const apiResponseData: BacktestResultAPI = {
        ...backtestResultInternal,
        startDate: backtestResultInternal.startDate.toISOString().split('T')[0], // Example: YYYY-MM-DD
        endDate: backtestResultInternal.endDate.toISOString().split('T')[0],     // Example: YYYY-MM-DD
        trades: backtestResultInternal.trades.map((trade: import('../backtest/index').Trade): APITrade => ({
            ...trade,
            // trade.date is Date from import('../backtest/index').Trade
            // APITrade expects date as string
            date: (trade.date as Date).toISOString().split('T')[0],
        })),
        // Optional chaining for historicalDataUsed and aiDecisionLog as they might not exist
        historicalDataUsed: backtestResultInternal.historicalDataUsed?.map((point: import('../services/dataService').HistoricalDataPoint): APIHistoricalDataPoint => ({
            ...point,
            // point.date is Date from import('../services/dataService').HistoricalDataPoint
            // APIHistoricalDataPoint expects date as string
            date: (point.date as Date).toISOString().split('T')[0],
        })),
        aiDecisionLog: backtestResultInternal.aiDecisionLog?.map((decision: import('../strategies').AIDecision): APIAIDecision => ({
            ...decision,
            // decision.date needs to be string for APIAIDecision
            // decision.date from import('../strategies').AIDecision is already a string.
            // APIAIDecision (from src/types.ts) also expects date: string.
            // No conversion needed, just pass it through.
            date: decision.date,
        })),
        // portfolioHistory does not have a 'date' field to convert, only 'timestamp' and 'value'
        sharpeRatio: backtestResultInternal.sharpeRatio,
        maxDrawdown: backtestResultInternal.maxDrawdown, // Add this line
    };

    logger.info(`Backtest API: Successfully ran backtest for strategy ${strategyId} on ${symbol}`);
    res.status(200).json(apiResponseData);
  } catch (error: any) {
    logger.error(`Backtest API: Error running backtest for strategy ${strategyId} on ${symbol}:`, error);
    if (error.message.includes('Strategy not found') || error.message.includes('Failed to fetch historical data')) {
        // More specific error messages can be returned based on error types
        return res.status(404).json({ message: error.message });
    }
    if (error.message.includes('Invalid parameters') || error.message.includes('Data unavailable')) { // Example
        return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error running backtest', error: error.message });
  }
});

export default router;
