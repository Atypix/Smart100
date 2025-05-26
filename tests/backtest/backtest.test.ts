// Mock dependencies
// Mock dependencies
jest.mock('../../src/services/dataService', () => ({
  fetchHistoricalDataFromDB: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  __esModule: true, // Added for proper ES Module default export mocking
  default: { 
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));
// Mock strategyManager's getStrategy
jest.mock('../../src/strategies/strategyManager', () => ({
  ...jest.requireActual('../../src/strategies/strategyManager'), // Import and retain default behavior
  getStrategy: jest.fn(),
}));

import {
  runBacktest,
  // simpleThresholdStrategy, // No longer directly imported for tests, will be loaded by manager
  // StrategyFunction, // Replaced by TradingStrategy
  Portfolio,
  Trade,
  // StrategyInput, // Replaced by StrategyContext
  // StrategyOutput, // Replaced by StrategySignal
  BacktestResult,
} from '../../src/backtest'; // Adjust path as necessary
import { fetchHistoricalDataFromDB as mockFetchHistoricalDataFromDB } from '../../src/services/dataService'; // Mocked function
import { HistoricalDataPoint } from '../../src/services/dataService'; // Actual type
import logger from '../../src/utils/logger'; // Corrected import, Mocked logger
import { getStrategy as mockGetStrategy } from '../../src/strategies/strategyManager'; // Mocked getStrategy
import { adaptedSimpleThresholdStrategy } from '../../src/strategies/implementations/simpleThresholdStrategy'; // Import actual strategy for mock return


// --- Test Setup ---
const symbol = 'TEST_SYM';
const startDate = new Date('2023-01-01');
const endDate = new Date('2023-01-10');
const initialCash = 10000;

// Helper to create HistoricalDataPoint
const createDataPoint = (timestampDate: Date, closePrice: number, open?: number, high?: number, low?: number, volume?: number): HistoricalDataPoint => ({
  timestamp: Math.floor(timestampDate.getTime() / 1000),
  date: timestampDate,
  open: open || closePrice,
  high: high || closePrice,
  low: low || closePrice,
  close: closePrice,
  volume: volume || 1000,
  interval: '1d', // Default interval for tests
  source_api: 'TestSource', // Default source for tests
  symbol: symbol,
});

describe('Backtesting Module Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup mock for getStrategy to return the adaptedSimpleThresholdStrategy by default for relevant tests
    // This ensures that existing tests relying on 'simple-threshold' continue to work with minimal changes.
    (mockGetStrategy as jest.Mock).mockImplementation((strategyId: string) => {
      if (strategyId === 'simple-threshold') {
        return adaptedSimpleThresholdStrategy;
      }
      return undefined;
    });
  });

  const defaultStrategyParams = {
    upperThreshold: 150,
    lowerThreshold: 140,
    tradeAmount: 1,
  };

  describe('runBacktest with simple-threshold strategy (via StrategyManager)', () => {
    // --- Basic Scenario (Profit) ---
    // Strategy: Buy if price > 150, Sell if price < 140 (using defaultStrategyParams)
    // Data: Price starts low, goes above 150 (buy), then drops below 140 (sell at loss), then goes high (buy), then higher (sell at profit)
    // For a clear profit: Buy at 151, Sell at 160
    const profitableData: HistoricalDataPoint[] = [
      createDataPoint(new Date('2023-01-01'), 145), // Hold
      createDataPoint(new Date('2023-01-02'), 151), // BUY @ 151 (cash: 10000 - 151 = 9849, shares: 1)
      createDataPoint(new Date('2023-01-03'), 155), // Hold
      createDataPoint(new Date('2023-01-04'), 160), // SELL @ 160 (cash: 9849 + 160 = 10009, shares: 0)
      createDataPoint(new Date('2023-01-05'), 165), // Hold (price > 150, but cash might be an issue if we only bought 1 share)
                                                // If we consider buying multiple shares, this test becomes more complex.
                                                // The simpleThresholdStrategy buys 1 share.
    ];

    test('Basic Scenario (Profit): should execute trades and result in a profit', async () => {
      (mockFetchHistoricalDataFromDB as jest.Mock).mockResolvedValue(profitableData);

      const result = await runBacktest(symbol, startDate, endDate, initialCash, 'simple-threshold', defaultStrategyParams);
      
      expect(mockGetStrategy).toHaveBeenCalledWith('simple-threshold');
      expect(mockFetchHistoricalDataFromDB).toHaveBeenCalledWith(symbol, startDate, endDate, undefined, undefined);
      expect(result.symbol).toBe(symbol);
      expect(result.initialPortfolioValue).toBe(initialCash);
      expect(result.finalPortfolioValue).toBe(10009); // 10000 - 151 (buy) + 160 (sell) = 10009
      expect(result.totalProfitOrLoss).toBe(9);
      expect(result.profitOrLossPercentage).toBeCloseTo((9 / initialCash) * 100);
      expect(result.totalTrades).toBe(2);
      expect(result.dataPointsProcessed).toBe(profitableData.length);

      expect(result.trades.length).toBe(2);
      // Buy Trade
      expect(result.trades[0]).toMatchObject({
        action: 'BUY',
        price: 151,
        sharesTraded: 1,
        cashAfterTrade: initialCash - 151,
      });
      // Sell Trade
      expect(result.trades[1]).toMatchObject({
        action: 'SELL',
        price: 160,
        sharesTraded: 1,
        cashAfterTrade: initialCash - 151 + 160,
      });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Backtest completed for TEST_SYM'));
    });

    // --- Basic Scenario (Loss) ---
    // Strategy: Buy if price > 150, Sell if price < 140
    // Data: Price goes above 150 (buy), then drops below 140 (sell at loss)
    const lossData: HistoricalDataPoint[] = [
      createDataPoint(new Date('2023-01-01'), 145), // Hold
      createDataPoint(new Date('2023-01-02'), 151), // BUY @ 151 (cash: 9849, shares: 1)
      createDataPoint(new Date('2023-01-03'), 145), // Hold
      createDataPoint(new Date('2023-01-04'), 139), // SELL @ 139 (cash: 9849 + 139 = 9988, shares: 0)
    ];

    test('Basic Scenario (Loss): should execute trades and result in a loss', async () => {
      (mockFetchHistoricalDataFromDB as jest.Mock).mockResolvedValue(lossData);
      const result = await runBacktest(symbol, startDate, endDate, initialCash, 'simple-threshold', defaultStrategyParams);

      expect(mockGetStrategy).toHaveBeenCalledWith('simple-threshold');
      expect(result.initialPortfolioValue).toBe(initialCash);
      expect(result.finalPortfolioValue).toBe(9988); // 10000 - 151 (buy) + 139 (sell) = 9988
      expect(result.totalProfitOrLoss).toBe(-12);
      expect(result.profitOrLossPercentage).toBeCloseTo((-12 / initialCash) * 100);
      expect(result.totalTrades).toBe(2);
      expect(result.dataPointsProcessed).toBe(lossData.length);

      expect(result.trades.length).toBe(2);
      expect(result.trades[0].action).toBe('BUY');
      expect(result.trades[0].price).toBe(151);
      expect(result.trades[1].action).toBe('SELL');
      expect(result.trades[1].price).toBe(139);
    });

    // --- No Trades Scenario ---
    // Data: Price stays between 140 and 150
    const noTradesData: HistoricalDataPoint[] = [
      createDataPoint(new Date('2023-01-01'), 145),
      createDataPoint(new Date('2023-01-02'), 146),
      createDataPoint(new Date('2023-01-03'), 144),
    ];

    test('No Trades Scenario: should result in zero trades and no profit/loss', async () => {
      (mockFetchHistoricalDataFromDB as jest.Mock).mockResolvedValue(noTradesData);
      const result = await runBacktest(symbol, startDate, endDate, initialCash, 'simple-threshold', defaultStrategyParams);

      expect(mockGetStrategy).toHaveBeenCalledWith('simple-threshold');
      expect(result.initialPortfolioValue).toBe(initialCash);
      expect(result.finalPortfolioValue).toBe(initialCash); // Cash + 0 shares * last price
      expect(result.totalProfitOrLoss).toBe(0);
      expect(result.profitOrLossPercentage).toBe(0);
      expect(result.totalTrades).toBe(0);
      expect(result.trades.length).toBe(0);
      expect(result.dataPointsProcessed).toBe(noTradesData.length);
    });

    // --- Insufficient Funds Scenario ---
    // Data: Price goes above 150, but initial cash is too low to buy.
    const insufficientFundsData: HistoricalDataPoint[] = [
      createDataPoint(new Date('2023-01-01'), 151), // BUY signal, but not enough cash
    ];

    test('Insufficient Funds Scenario: should not execute BUY if cash is insufficient', async () => {
      (mockFetchHistoricalDataFromDB as jest.Mock).mockResolvedValue(insufficientFundsData);
      const lowInitialCash = 100; // Price is 151
      const result = await runBacktest(symbol, startDate, endDate, lowInitialCash, 'simple-threshold', defaultStrategyParams);
      
      expect(mockGetStrategy).toHaveBeenCalledWith('simple-threshold');
      expect(result.initialPortfolioValue).toBe(lowInitialCash);
      expect(result.finalPortfolioValue).toBe(lowInitialCash);
      expect(result.totalTrades).toBe(0);
      expect(result.dataPointsProcessed).toBe(insufficientFundsData.length);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Attempted BUY for TEST_SYM at 151, but insufficient cash.'),
        expect.any(Object)
      );
    });

    // --- Insufficient Shares Scenario ---
    // Data: Price drops below 140, but no shares to sell.
    const insufficientSharesData: HistoricalDataPoint[] = [
      createDataPoint(new Date('2023-01-01'), 139), // SELL signal, but no shares
    ];

    test('Insufficient Shares Scenario: should not execute SELL if shares are zero', async () => {
      (mockFetchHistoricalDataFromDB as jest.Mock).mockResolvedValue(insufficientSharesData);
      const result = await runBacktest(symbol, startDate, endDate, initialCash, 'simple-threshold', defaultStrategyParams);

      expect(mockGetStrategy).toHaveBeenCalledWith('simple-threshold');
      expect(result.initialPortfolioValue).toBe(initialCash);
      expect(result.finalPortfolioValue).toBe(initialCash);
      expect(result.totalTrades).toBe(0);
      expect(result.dataPointsProcessed).toBe(insufficientSharesData.length);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Attempted SELL for TEST_SYM at 139, but insufficient shares.'),
        expect.any(Object)
      );
    });

    // --- Edge Case: No Data ---
    test('Edge Case: No Data: should handle gracefully when fetchHistoricalDataFromDB returns empty', async () => {
      (mockFetchHistoricalDataFromDB as jest.Mock).mockResolvedValue([]);
      const result = await runBacktest(symbol, startDate, endDate, initialCash, 'simple-threshold', defaultStrategyParams);

      expect(mockGetStrategy).toHaveBeenCalledWith('simple-threshold');
      expect(result.symbol).toBe(symbol);
      expect(result.initialPortfolioValue).toBe(initialCash);
      expect(result.finalPortfolioValue).toBe(initialCash);
      expect(result.totalProfitOrLoss).toBe(0);
      expect(result.profitOrLossPercentage).toBe(0);
      expect(result.trades.length).toBe(0);
      expect(result.totalTrades).toBe(0);
      expect(result.dataPointsProcessed).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No historical data found'));
    });
    
    // This test is more about the internal `execute` call of the strategy.
    // Since adaptedSimpleThresholdStrategy is now a concrete object, we can spy on its execute method.
    test('Strategy Execution: adaptedSimpleThresholdStrategy.execute should be called with correct context', async () => {
        const singleDataPoint: HistoricalDataPoint[] = [createDataPoint(new Date('2023-01-01'), 145)];
        (mockFetchHistoricalDataFromDB as jest.Mock).mockResolvedValue(singleDataPoint);

        // Spy on the actual execute method of the strategy object
        const executeSpy = jest.spyOn(adaptedSimpleThresholdStrategy, 'execute');

        await runBacktest(symbol, startDate, endDate, initialCash, 'simple-threshold', defaultStrategyParams);

        expect(executeSpy).toHaveBeenCalledTimes(singleDataPoint.length);
        // Check the context for the first call
        const expectedContext = {
            historicalData: singleDataPoint,
            currentIndex: 0,
            portfolio: expect.objectContaining({ cash: initialCash, shares: 0 }),
            tradeHistory: [],
            parameters: defaultStrategyParams,
        };
        expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining(expectedContext));
        
        executeSpy.mockRestore(); // Restore original method
    });

    // --- Test amount parameter handling within runBacktest (using default strategy params for simple-threshold) ---
    // The adaptedSimpleThresholdStrategy uses context.parameters.tradeAmount
    // So we test by changing the tradeAmount parameter.
    const multiShareParams = { ...defaultStrategyParams, tradeAmount: 2 };
    const multiShareData: HistoricalDataPoint[] = [
      createDataPoint(new Date('2023-01-01'), 145), 
      createDataPoint(new Date('2023-01-02'), 151), // BUY 2 @ 151
      createDataPoint(new Date('2023-01-03'), 139), // SELL 2 @ 139
    ];
    
    test('Strategy Parameters: should trade specified number of shares based on strategyParams.tradeAmount', async () => {
        (mockFetchHistoricalDataFromDB as jest.Mock).mockResolvedValue(multiShareData);
        const result = await runBacktest(symbol, startDate, endDate, initialCash, 'simple-threshold', multiShareParams);
        
        expect(mockGetStrategy).toHaveBeenCalledWith('simple-threshold');
        expect(result.totalTrades).toBe(2);
        expect(result.trades[0].action).toBe('BUY');
        expect(result.trades[0].sharesTraded).toBe(multiShareParams.tradeAmount);
        expect(result.trades[0].price).toBe(151);

        expect(result.trades[1].action).toBe('SELL');
        expect(result.trades[1].sharesTraded).toBe(multiShareParams.tradeAmount);
        expect(result.trades[1].price).toBe(139);
        
        expect(result.finalPortfolioValue).toBe(initialCash - (151 * multiShareParams.tradeAmount) + (139 * multiShareParams.tradeAmount));
    });

    // Test for default sharesToTrade = 1 if strategy returns amount: 0 or undefined signal.amount
    // This is implicitly handled by runBacktest's logic:
    // `const sharesToTrade = (signal.amount && signal.amount > 0) ? signal.amount : 1;`
    // We can test this by providing a strategy parameter that leads to signal.amount = 0.
    const zeroAmountParams = { ...defaultStrategyParams, tradeAmount: 0 };
     const dataForDefaultAmount: HistoricalDataPoint[] = [createDataPoint(new Date('2023-01-02'), 151)];

    test('Signal Amount: should default to 1 share if strategy parameters lead to signal.amount being 0', async () => {
        (mockFetchHistoricalDataFromDB as jest.Mock).mockResolvedValue(dataForDefaultAmount);
        
        // adaptedSimpleThresholdStrategy will generate a BUY signal with amount = 0 due to zeroAmountParams.tradeAmount
        const result = await runBacktest(symbol, startDate, endDate, initialCash, 'simple-threshold', zeroAmountParams);
        
        expect(mockGetStrategy).toHaveBeenCalledWith('simple-threshold');
        expect(result.totalTrades).toBe(1);
        expect(result.trades[0].action).toBe('BUY');
        expect(result.trades[0].sharesTraded).toBe(1); // Should default to 1 because strategy signal.amount was 0
    });
  });

  describe('runBacktest with Invalid Strategy ID', () => {
    test('should handle invalid strategy ID gracefully', async () => {
      const dummyData: HistoricalDataPoint[] = []; // Define dummy data for this test scope
      (mockFetchHistoricalDataFromDB as jest.Mock).mockResolvedValue(dummyData);
      (mockGetStrategy as jest.Mock).mockReturnValue(undefined); // Simulate strategy not found

      const invalidStrategyId = 'non-existent-strategy';
      const result = await runBacktest(symbol, startDate, endDate, initialCash, invalidStrategyId, {});

      expect(mockGetStrategy).toHaveBeenCalledWith(invalidStrategyId);
      expect(logger.error).toHaveBeenCalledWith(`Strategy with ID '${invalidStrategyId}' not found. Aborting backtest.`);
      
      // Expect a default/empty backtest result
      expect(result.symbol).toBe(symbol);
      expect(result.initialPortfolioValue).toBe(initialCash);
      expect(result.finalPortfolioValue).toBe(initialCash);
      expect(result.totalProfitOrLoss).toBe(0);
      expect(result.totalTrades).toBe(0);
      expect(result.dataPointsProcessed).toBe(0); // Because it aborts before processing data
    });
  });
});
