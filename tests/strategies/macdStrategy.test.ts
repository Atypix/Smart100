import { macdStrategy } from '../../src/strategies/implementations/macdStrategy';
import { StrategyContext, StrategySignal } from '../../src/strategies/strategy.types';
import { Portfolio } from '../../src/backtest';
import { HistoricalDataPoint } from '../../src/services/dataService';
import { calculateMACD } from '../../src/utils/technicalIndicators';

// Mock the technical indicator function
jest.mock('../../src/utils/technicalIndicators');

// Cast the mocked function to Jest's mock type
const mockedCalculateMACD = calculateMACD as jest.MockedFunction<typeof calculateMACD>;

describe('MACD Crossover Strategy', () => {
  let baseContext: StrategyContext<any>; // Use 'any' for parameters if not strictly typed for test
  const defaultParams = {
    shortPeriod: 12,
    longPeriod: 26,
    signalPeriod: 9,
    tradeAmount: 1,
  };

  const createMockHistoricalData = (length: number, price: number): HistoricalDataPoint[] => {
    return Array(length).fill(null).map((_, i) => {
      const timestampInMilliseconds = Date.now() + i * 1000;
      return {
        timestamp: Math.floor(timestampInMilliseconds / 1000), // Unix epoch seconds
        date: new Date(timestampInMilliseconds), // Date object
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 100,
        source_api: 'mock', // Corrected field name
        symbol: 'MOCK',
        interval: '1d',
        // fetchedAt is not part of HistoricalDataPoint
      };
    });
  };

  beforeEach(() => {
    mockedCalculateMACD.mockReset();

    baseContext = {
      symbol: 'MOCK', // Added symbol
      historicalData: createMockHistoricalData(50, 100), 
      currentIndex: 49,
      portfolio: { 
        cash: 1000, 
        shares: 10, 
        initialValue: 1000, 
        currentValue: 1000 + 10 * 100,
        // Mock necessary methods if Portfolio is a class with methods
        getCash: () => baseContext.portfolio.cash,
        getPosition: () => ({ quantity: baseContext.portfolio.shares, averagePrice: 100 }), // Example
        getTrades: () => [],
        recordTrade: jest.fn(),
        getMarketValue: () => baseContext.portfolio.currentValue,
        getHistoricalPnl: () => [],
      } as unknown as Portfolio, // Cast for simplicity, or create a full mock
      parameters: { ...defaultParams },
      tradeHistory: [],
      signalHistory: [], // Added signalHistory
    };
  });

  // Test cases will follow

  it('should generate a BUY signal when MACD crosses above Signal line', async () => { // Made async
    const context = { ...baseContext };
    const currentPrice = context.historicalData[context.currentIndex].close;
    context.portfolio.cash = currentPrice * defaultParams.tradeAmount + 100; // Ensure enough cash

    mockedCalculateMACD.mockReturnValue({
      macdLine:   Array(context.historicalData.length).fill(NaN).map((_, i) => {
        if (i === context.currentIndex) return 12; // Current MACD
        if (i === context.currentIndex - 1) return 8;  // Previous MACD
        return NaN;
      }),
      signalLine: Array(context.historicalData.length).fill(NaN).map((_, i) => {
        if (i === context.currentIndex) return 10; // Current Signal
        if (i === context.currentIndex - 1) return 9;  // Previous Signal (MACD was below Signal)
        return NaN;
      }),
      histogram: Array(context.historicalData.length).fill(NaN), // Not directly used by this strategy logic
    });
    // previousMACD (8) < previousSignal (9)
    // currentMACD (12) > currentSignal (10) -- Bullish Crossover

    const result = await Promise.resolve(macdStrategy.execute(context));
    expect(result.action).toBe('BUY');
    expect(result.amount).toBe(defaultParams.tradeAmount);
  });

  it('should generate a SELL signal when MACD crosses below Signal line', async () => {
    const context = { ...baseContext };
    context.portfolio.shares = defaultParams.tradeAmount + 5; // Ensure enough shares

    mockedCalculateMACD.mockReturnValue({
      macdLine:   Array(context.historicalData.length).fill(NaN).map((_, i) => {
        if (i === context.currentIndex) return 8;  // Current MACD
        if (i === context.currentIndex - 1) return 12; // Previous MACD
        return NaN;
      }),
      signalLine: Array(context.historicalData.length).fill(NaN).map((_, i) => {
        if (i === context.currentIndex) return 9;  // Current Signal
        if (i === context.currentIndex - 1) return 10; // Previous Signal (MACD was above Signal)
        return NaN;
      }),
      histogram: Array(context.historicalData.length).fill(NaN),
    });
    // previousMACD (12) > previousSignal (10)
    // currentMACD (8) < currentSignal (9) -- Bearish Crossover

    const result = await Promise.resolve(macdStrategy.execute(context));
    expect(result.action).toBe('SELL');
    expect(result.amount).toBe(defaultParams.tradeAmount);
  });

  it('should generate a HOLD signal if MACD lines are converging but no crossover', async () => {
    const context = { ...baseContext };
    mockedCalculateMACD.mockReturnValue({
      macdLine:   Array(context.historicalData.length).fill(NaN).map((_, i) => {
        if (i === context.currentIndex) return 11; 
        if (i === context.currentIndex - 1) return 10;
        return NaN;
      }),
      signalLine: Array(context.historicalData.length).fill(NaN).map((_, i) => {
        if (i === context.currentIndex) return 11.5; 
        if (i === context.currentIndex - 1) return 12; 
        return NaN;
      }),
      histogram: Array(context.historicalData.length).fill(NaN),
    });
    // previousMACD (10) < previousSignal (12)
    // currentMACD (11) < currentSignal (11.5) -- Still below, no crossover

    const result = await Promise.resolve(macdStrategy.execute(context));
    expect(result.action).toBe('HOLD');
  });
  
  it('should generate a HOLD signal if MACD lines are diverging (already crossed over previously)', async () => {
    const context = { ...baseContext };
    mockedCalculateMACD.mockReturnValue({
      macdLine:   Array(context.historicalData.length).fill(NaN).map((_, i) => {
        if (i === context.currentIndex) return 13; 
        if (i === context.currentIndex - 1) return 12;
        return NaN;
      }),
      signalLine: Array(context.historicalData.length).fill(NaN).map((_, i) => {
        if (i === context.currentIndex) return 9; 
        if (i === context.currentIndex - 1) return 10; 
        return NaN;
      }),
      histogram: Array(context.historicalData.length).fill(NaN),
    });
    // previousMACD (12) > previousSignal (10) -- was already crossed
    // currentMACD (13) > currentSignal (9) -- still above, diverging

    const result = await Promise.resolve(macdStrategy.execute(context));
    expect(result.action).toBe('HOLD');
  });

  it('should generate a HOLD signal if currentMACD is NaN', async () => {
    const context = { ...baseContext };
    mockedCalculateMACD.mockReturnValue({
      macdLine:   Array(context.historicalData.length).fill(NaN).map((_, i) => {
        if (i === context.currentIndex) return NaN; // Current MACD is NaN
        if (i === context.currentIndex - 1) return 8;
        return NaN;
      }),
      signalLine: Array(context.historicalData.length).fill(NaN).map((_, i) => {
        if (i === context.currentIndex) return 10;
        if (i === context.currentIndex - 1) return 9;
        return NaN;
      }),
      histogram: Array(context.historicalData.length).fill(NaN),
    });
    const result = await Promise.resolve(macdStrategy.execute(context));
    expect(result.action).toBe('HOLD');
  });

  it('should generate a HOLD signal if previousSignal is NaN', async () => {
    const context = { ...baseContext };
    mockedCalculateMACD.mockReturnValue({
      macdLine:   Array(context.historicalData.length).fill(NaN).map((_, i) => {
        if (i === context.currentIndex) return 12;
        if (i === context.currentIndex - 1) return 8;
        return NaN;
      }),
      signalLine: Array(context.historicalData.length).fill(NaN).map((_, i) => {
        if (i === context.currentIndex) return 10;
        if (i === context.currentIndex - 1) return NaN; // Previous Signal is NaN
        return NaN;
      }),
      histogram: Array(context.historicalData.length).fill(NaN),
    });
    const result = await Promise.resolve(macdStrategy.execute(context));
    expect(result.action).toBe('HOLD');
  });
  
  it('should generate a HOLD signal if currentIndex < 1', async () => {
    const context = { ...baseContext, currentIndex: 0 };
    // No need to mock calculateMACD as the strategy should return HOLD before calling it.
    const result = await Promise.resolve(macdStrategy.execute(context));
    expect(result.action).toBe('HOLD');
  });

  it('should generate a HOLD signal for BUY if insufficient cash', async () => {
    const context = { ...baseContext };
    const currentPrice = context.historicalData[context.currentIndex].close;
    context.portfolio.cash = currentPrice * defaultParams.tradeAmount - 1; // Insufficient cash

    mockedCalculateMACD.mockReturnValue({ // BUY signal conditions
      macdLine:   Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 12 : (i === context.currentIndex - 1 ? 8 : NaN)),
      signalLine: Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 10 : (i === context.currentIndex - 1 ? 9 : NaN)),
      histogram: Array(context.historicalData.length).fill(NaN),
    });
    
    const result = await Promise.resolve(macdStrategy.execute(context));
    expect(result.action).toBe('HOLD');
  });

  it('should generate a HOLD signal for SELL if insufficient shares', async () => {
    const context = { ...baseContext };
    context.portfolio.shares = defaultParams.tradeAmount - 0.1; // Insufficient shares (assuming tradeAmount can be > shares)
     if (defaultParams.tradeAmount === 0) context.portfolio.shares = -1; // Ensure it's less if tradeAmount is 0

    mockedCalculateMACD.mockReturnValue({ // SELL signal conditions
      macdLine:   Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 8 : (i === context.currentIndex - 1 ? 12 : NaN)),
      signalLine: Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 9 : (i === context.currentIndex - 1 ? 10 : NaN)),
      histogram: Array(context.historicalData.length).fill(NaN),
    });

    const result = await Promise.resolve(macdStrategy.execute(context));
    expect(result.action).toBe('HOLD');
  });
  
   it('should generate HOLD if longPeriod is not greater than shortPeriod', async () => {
    const context = { ...baseContext };
    context.parameters.longPeriod = context.parameters.shortPeriod; // Invalid params

    // No need to mock calculateMACD, strategy should return HOLD due to param validation
    const result = await Promise.resolve(macdStrategy.execute(context));
    expect(result.action).toBe('HOLD');
  });

});
