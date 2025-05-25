// Mock dependencies
jest.mock('../../src/services/dataService', () => ({
  fetchHistoricalDataFromDB: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  runBacktest,
  simpleThresholdStrategy, // Using the actual strategy
  StrategyFunction, // For typing if we decide to mock the strategy
  Portfolio,
  Trade,
  StrategyInput,
  StrategyOutput,
  BacktestResult,
} from '../../src/backtest'; // Adjust path as necessary
import { fetchHistoricalDataFromDB as mockFetchHistoricalDataFromDB } from '../../src/services/dataService'; // Mocked function
import { HistoricalDataPoint } from '../../src/services/dataService'; // Actual type
import { logger } from '../../src/utils/logger'; // Mocked logger

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
  });

  describe('runBacktest with simpleThresholdStrategy', () => {
    // --- Basic Scenario (Profit) ---
    // Strategy: Buy if price > 150, Sell if price < 140
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

      const result = await runBacktest(symbol, startDate, endDate, initialCash, simpleThresholdStrategy);

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
      const result = await runBacktest(symbol, startDate, endDate, initialCash, simpleThresholdStrategy);

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
      const result = await runBacktest(symbol, startDate, endDate, initialCash, simpleThresholdStrategy);

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
      const result = await runBacktest(symbol, startDate, endDate, lowInitialCash, simpleThresholdStrategy);

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
      const result = await runBacktest(symbol, startDate, endDate, initialCash, simpleThresholdStrategy);

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
      const result = await runBacktest(symbol, startDate, endDate, initialCash, simpleThresholdStrategy);

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
    
    // --- Test Strategy Input (Optional - advanced mocking) ---
    // This test demonstrates spying on the strategy function itself.
    test('Strategy Input: simpleThresholdStrategy should be called with correct input', async () => {
        const singleDataPoint: HistoricalDataPoint[] = [createDataPoint(new Date('2023-01-01'), 145)];
        (mockFetchHistoricalDataFromDB as jest.Mock).mockResolvedValue(singleDataPoint);

        // Create a spy for the strategy function
        const spiedStrategy = jest.fn(simpleThresholdStrategy);

        await runBacktest(symbol, startDate, endDate, initialCash, spiedStrategy);

        expect(spiedStrategy).toHaveBeenCalledTimes(singleDataPoint.length);
        // Check the input for the first call (and only call in this case)
        const expectedStrategyInput: StrategyInput = {
            dataPoint: singleDataPoint[0],
            portfolio: expect.objectContaining({ // Check key aspects of the portfolio
                cash: initialCash,
                shares: 0,
                initialValue: initialCash,
                currentValue: initialCash, // Before first strategy call, currentValue = initialValue
            }),
            tradeHistory: [], // Initially empty
        };
        expect(spiedStrategy).toHaveBeenCalledWith(expect.objectContaining(expectedStrategyInput));
    });

    // --- Test amount parameter in StrategyOutput ---
    // Strategy: Buy if price > 150 (buy 2 shares), Sell if price < 140 (sell 2 shares)
    const multiShareStrategy: StrategyFunction = (input: StrategyInput): StrategyOutput => {
        const { dataPoint, portfolio } = input;
        const price = dataPoint.close;
        const sharesToTrade = 2;

        if (price > 150 && portfolio.cash >= price * sharesToTrade) {
            return { action: 'BUY', amount: sharesToTrade };
        } else if (price < 140 && portfolio.shares >= sharesToTrade) {
            return { action: 'SELL', amount: sharesToTrade };
        }
        return { action: 'HOLD' };
    };

    const multiShareData: HistoricalDataPoint[] = [
      createDataPoint(new Date('2023-01-01'), 145), 
      createDataPoint(new Date('2023-01-02'), 151), // BUY 2 @ 151 (cash: 10000 - 302 = 9698, shares: 2)
      createDataPoint(new Date('2023-01-03'), 139), // SELL 2 @ 139 (cash: 9698 + 278 = 9976, shares: 0)
    ];
    
    test('StrategyOutput Amount: should trade specified number of shares if amount is provided', async () => {
        (mockFetchHistoricalDataFromDB as jest.Mock).mockResolvedValue(multiShareData);
        const result = await runBacktest(symbol, startDate, endDate, initialCash, multiShareStrategy);

        expect(result.totalTrades).toBe(2);
        expect(result.trades[0].action).toBe('BUY');
        expect(result.trades[0].sharesTraded).toBe(2);
        expect(result.trades[0].price).toBe(151);

        expect(result.trades[1].action).toBe('SELL');
        expect(result.trades[1].sharesTraded).toBe(2);
        expect(result.trades[1].price).toBe(139);
        
        expect(result.finalPortfolioValue).toBe(initialCash - (151*2) + (139*2)); // 9976
    });

    test('StrategyOutput Amount: should default to 1 share if amount is zero or not provided by strategy', async () => {
        const strategyDefaultsToOneShare: StrategyFunction = (input: StrategyInput): StrategyOutput => {
            const { dataPoint, portfolio } = input;
            const price = dataPoint.close;
            if (price > 150 && portfolio.cash >= price) { // amount: 0 or undefined
                return { action: 'BUY', amount: 0 }; // or just { action: 'BUY' }
            }
            return { action: 'HOLD' };
        };
        const dataForDefaultAmount: HistoricalDataPoint[] = [createDataPoint(new Date('2023-01-02'), 151)];
        (mockFetchHistoricalDataFromDB as jest.Mock).mockResolvedValue(dataForDefaultAmount);
        
        const result = await runBacktest(symbol, startDate, endDate, initialCash, strategyDefaultsToOneShare);
        
        expect(result.totalTrades).toBe(1);
        expect(result.trades[0].action).toBe('BUY');
        expect(result.trades[0].sharesTraded).toBe(1); // Should default to 1
    });

  });
});
