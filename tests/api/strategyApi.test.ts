// tests/api/strategyApi.test.ts
import request from 'supertest';
import { createApp } from '../../src/index'; // Corrected import: createApp instead of app
import { getAvailableStrategies } from '../../src/strategies/strategyManager';
import { runBacktest, BacktestResult } from '../../src/backtest'; // Import BacktestResult from here
import { TradingStrategy, StrategyParameterDefinition } from '../../src/strategies/strategy.types'; // For typing mocks

// Mock the strategyManager and backtest functions
jest.mock('../../src/strategies/strategyManager', () => ({
  getAvailableStrategies: jest.fn(),
}));

jest.mock('../../src/backtest', () => ({
  runBacktest: jest.fn(),
}));

// Typedefs for our mocks
const mockGetAvailableStrategies = getAvailableStrategies as jest.MockedFunction<typeof getAvailableStrategies>;
const mockRunBacktest = runBacktest as jest.MockedFunction<typeof runBacktest>;

let app: any; // Declare app variable

describe('Strategy API Endpoints', () => {
  beforeAll(() => { // Use beforeAll to create app instance once for the suite
    app = createApp();
  });

  beforeEach(() => {
    // Reset mocks before each test
    mockGetAvailableStrategies.mockReset();
    mockRunBacktest.mockReset();
  });

  describe('GET /api/strategies', () => {
    it('should return 200 and a list of available strategies', async () => {
      const mockStrategies: Partial<TradingStrategy>[] = [
        { id: 'strat1', name: 'Strategy One', description: 'Desc 1', parameters: [{ name: 'p1', label: 'Param 1', type: 'number', defaultValue: 10 }] as StrategyParameterDefinition[] },
        { id: 'strat2', name: 'Strategy Two', description: 'Desc 2', parameters: [] },
      ];
      mockGetAvailableStrategies.mockReturnValue(mockStrategies as TradingStrategy[]); // Cast as full TradingStrategy for mock

      const response = await request(app).get('/api/strategies');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(2);
      expect(response.body[0].id).toBe('strat1');
      expect(response.body[0].name).toBe('Strategy One');
      expect(response.body[0].parameters).toBeDefined();
      expect(mockGetAvailableStrategies).toHaveBeenCalledTimes(1);
    });

    it('should return 500 if getAvailableStrategies throws an error', async () => {
      mockGetAvailableStrategies.mockImplementation(() => {
        throw new Error('Internal strategy manager error');
      });

      const response = await request(app).get('/api/strategies');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Error fetching strategies');
      expect(response.body.error).toBe('Internal strategy manager error');
    });
  });

  describe('POST /api/backtest', () => {
    const validBacktestBody = {
      strategyId: 'ichimoku-cloud',
      strategyParams: { tenkanPeriod: 9, kijunPeriod: 26 },
      symbol: 'BTCUSDT',
      startDate: '2023-01-01',
      endDate: '2023-03-31',
      initialCash: 10000,
      sourceApi: 'Binance',
      interval: '1d',
    };

    const mockSuccessResult: BacktestResult = {
      symbol: 'BTCUSDT',
      startDate: new Date('2023-01-01'), // Reverted to Date object
      endDate: new Date('2023-03-31'),   // Reverted to Date object
      initialPortfolioValue: 10000,
      finalPortfolioValue: 12000,
      totalProfitOrLoss: 2000,
      profitOrLossPercentage: 20,
      trades: [],
      totalTrades: 0,
      dataPointsProcessed: 90,
      // aiDecisionLog is optional, so not included in this general mock result
    };

    it('should return 200 and backtest results for a successful backtest', async () => {
      mockRunBacktest.mockResolvedValue(mockSuccessResult);

      const response = await request(app)
        .post('/api/strategies/backtest') // Corrected path
        .send(validBacktestBody);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ...mockSuccessResult,
        startDate: mockSuccessResult.startDate.toISOString(),
        endDate: mockSuccessResult.endDate.toISOString(),
      });
      expect(mockRunBacktest).toHaveBeenCalledWith(
        validBacktestBody.symbol,
        new Date(validBacktestBody.startDate), // runBacktest expects Date objects
        new Date(validBacktestBody.endDate),   // runBacktest expects Date objects
        validBacktestBody.initialCash,
        validBacktestBody.strategyId,
        validBacktestBody.strategyParams,
        validBacktestBody.sourceApi,
        validBacktestBody.interval
      );
    });

    it('should return 400 for missing required fields', async () => {
      const incompleteBody = { ...validBacktestBody, symbol: undefined };
      // @ts-ignore to allow sending incomplete body for testing
      const response = await request(app).post('/api/strategies/backtest').send(incompleteBody); // Corrected path
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Missing required field: symbol');
    });
    
    it('should return 400 for non-positive initialCash', async () => {
      const invalidBody = { ...validBacktestBody, initialCash: 0 };
      const response = await request(app).post('/api/strategies/backtest').send(invalidBody); // Corrected path
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('initialCash must be a positive number.');
    });

    it('should return 400 for invalid date format', async () => {
      const invalidDateBody = { ...validBacktestBody, startDate: 'invalid-date' };
      const response = await request(app).post('/api/strategies/backtest').send(invalidDateBody); // Corrected path
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid date format. Use YYYY-MM-DD.');
    });
    
    it('should return 400 if endDate is not after startDate', async () => {
      const invalidDateRangeBody = { ...validBacktestBody, endDate: '2023-01-01', startDate: '2023-01-31' };
      const response = await request(app).post('/api/strategies/backtest').send(invalidDateRangeBody); // Corrected path
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('endDate must be after startDate.');
    });

    it('should return 404 if strategy is not found (simulated by runBacktest error)', async () => {
      mockRunBacktest.mockImplementation(async () => {
        // This matches the error thrown by runBacktest if getStrategy returns undefined
        throw new Error("Strategy with ID 'non-existent-strat' not found. Aborting backtest.");
      });
      const bodyWithInvalidStrategy = { ...validBacktestBody, strategyId: 'non-existent-strat' };
      const response = await request(app).post('/api/strategies/backtest').send(bodyWithInvalidStrategy); // Corrected path
      expect(response.status).toBe(404); // strategyRoutes.ts handles this specific error message as 404
      expect(response.body.message).toContain("Strategy with ID 'non-existent-strat' not found");
    });

    it('should return 500 if runBacktest throws an unexpected internal error', async () => {
      mockRunBacktest.mockImplementation(async () => {
        throw new Error('Unexpected backtesting engine failure');
      });
      const response = await request(app).post('/api/strategies/backtest').send(validBacktestBody); // Corrected path
      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Error running backtest');
      expect(response.body.error).toBe('Unexpected backtesting engine failure');
    });

    it('should return 200 and backtest results including aiDecisionLog when AISelectorStrategy is used', async () => {
      const mockAIDecisionLog = [
        {
          timestamp: 1672531200, 
          date: '2023-01-01',
          chosenStrategyId: 'candidateStrat1',
          chosenStrategyName: 'Candidate Strat 1',
          parametersUsed: { paramA: 10 },
          evaluationScore: 0.75,
          evaluationMetricUsed: 'pnl',
        },
      ];
      const mockAIResult: BacktestResult = { // Removed strategyId from here
        ...mockSuccessResult, 
        symbol: 'AI_TEST_SYM',
        aiDecisionLog: mockAIDecisionLog,
      };
      mockRunBacktest.mockResolvedValue(mockAIResult);

      const aiBacktestBody = {
        ...validBacktestBody,
        strategyId: 'ai-selector', // Crucial part for this test
        symbol: 'AI_TEST_SYM',
      };

      const response = await request(app)
        .post('/api/strategies/backtest') // Corrected path
        .send(aiBacktestBody);

      expect(response.status).toBe(200);
      expect(response.body.symbol).toBe('AI_TEST_SYM');
      expect(response.body.aiDecisionLog).toBeDefined();
      expect(Array.isArray(response.body.aiDecisionLog)).toBe(true);
      expect(response.body.aiDecisionLog.length).toBe(1);
      expect(response.body.aiDecisionLog[0]).toEqual(mockAIDecisionLog[0]);
      
      expect(mockRunBacktest).toHaveBeenCalledWith(
        aiBacktestBody.symbol,
        new Date(aiBacktestBody.startDate),
        new Date(aiBacktestBody.endDate),
        aiBacktestBody.initialCash,
        aiBacktestBody.strategyId, // Should be 'ai-selector'
        aiBacktestBody.strategyParams, // These would be params for AISelector itself
        aiBacktestBody.sourceApi,
        aiBacktestBody.interval
      );
    });
  });
});
