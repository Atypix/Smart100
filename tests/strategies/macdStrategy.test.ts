import { macdStrategy } from '../../src/strategies/implementations/macdStrategy';
import { StrategyContext, StrategySignal } from '../../src/strategies/strategy.types';
import { Portfolio } from '../../src/backtest'; // Corrected import for Portfolio
import { HistoricalDataPoint } from '../../src/services/dataService';
import { calculateMACD } from '../../src/utils/technicalIndicators';

// Mock the technical indicator function
jest.mock('../../src/utils/technicalIndicators');

// Cast the mocked function to Jest's mock type
const mockedCalculateMACD = calculateMACD as jest.MockedFunction<typeof calculateMACD>;

describe('MACD Crossover Strategy', () => {
  let baseContext: StrategyContext;
  // Define a more specific type for params if available, or use Record
  const defaultParams: Record<string, number | string | boolean> = { 
    shortPeriod: 12,
    longPeriod: 26,
    signalPeriod: 9,
    tradeAmount: 1,
  };

  const createMockHistoricalData = (length: number, price: number): HistoricalDataPoint[] => {
    const now = Date.now();
    return Array(length).fill(null).map((_, i) => {
      const timestamp = now + i * 1000;
      return {
        timestamp: Math.floor(timestamp / 1000), // Epoch seconds
        date: new Date(timestamp), // Date object
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 100,
        source_api: 'mock', // Corrected field name
        symbol: 'MOCK',
        interval: '1d',
        // fetchedAt is not part of HistoricalDataPoint, but FinancialData.
        // If HistoricalDataPoint needs it, definition should be updated.
        // For now, assuming it's not strictly needed for strategy logic if based on HistoricalDataPoint.
      };
    });
  };

  beforeEach(() => {
    mockedCalculateMACD.mockReset();

    baseContext = {
      historicalData: createMockHistoricalData(50, 100), // Default price 100
      currentIndex: 49, 
      portfolio: { cash: 1000, shares: 10, initialValue: 1000, currentValue: 1000 }, // Corrected initialCash to initialValue
      parameters: { ...defaultParams },
      // These are not part of StrategyContext, remove them or add to type if needed by macdStrategy specifically
      // getAvailableStrategies: jest.fn(() => []), 
      // getStrategy: jest.fn(() => undefined),
    } as StrategyContext; // Added 'as StrategyContext' for stricter type checking if getAvailableStrategies/getStrategy are removed
  });

  // Test cases will follow

  it('should generate a BUY signal when MACD crosses above Signal line', async () => { // Made async
    const context = { ...baseContext };
    const currentPrice = context.historicalData[context.currentIndex].close;
    context.portfolio.cash = currentPrice * (defaultParams.tradeAmount as number) + 100; // Ensure enough cash

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

    const signals = await macdStrategy.execute(context); // Awaited and changed variable name
    expect(signals[0].action).toBe('BUY'); // Used signals[0]
    expect(signals[0].amount).toBe(defaultParams.tradeAmount); // Used signals[0]
  });

  it('should generate a SELL signal when MACD crosses below Signal line', async () => { // Made async
    const context = { ...baseContext };
    context.portfolio.shares = (defaultParams.tradeAmount as number) + 5; // Ensure enough shares

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

    const signals = await macdStrategy.execute(context); // Awaited and changed variable name
    expect(signals[0].action).toBe('SELL'); // Used signals[0]
    expect(signals[0].amount).toBe(defaultParams.tradeAmount); // Used signals[0]
  });

  it('should generate a HOLD signal if MACD lines are converging but no crossover', async () => { // Made async
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

    const signals = await macdStrategy.execute(context); // Awaited and changed variable name
    expect(signals[0].action).toBe('HOLD'); // Used signals[0]
  });
  
  it('should generate a HOLD signal if MACD lines are diverging (already crossed over previously)', async () => { // Made async
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

    const signals = await macdStrategy.execute(context); // Awaited and changed variable name
    expect(signals[0].action).toBe('HOLD'); // Used signals[0]
  });

  it('should generate a HOLD signal if currentMACD is NaN', async () => { // Made async
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
    const signals = await macdStrategy.execute(context); // Awaited and changed variable name
    expect(signals[0].action).toBe('HOLD'); // Used signals[0]
  });

  it('should generate a HOLD signal if previousSignal is NaN', async () => { // Made async
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
    const signals = await macdStrategy.execute(context); // Awaited and changed variable name
    expect(signals[0].action).toBe('HOLD'); // Used signals[0]
  });
  
  it('should generate a HOLD signal if currentIndex < 1', async () => { // Made async
    const context = { ...baseContext, currentIndex: 0 };
    // No need to mock calculateMACD as the strategy should return HOLD before calling it.
    const signals = await macdStrategy.execute(context); // Awaited and changed variable name
    expect(signals[0].action).toBe('HOLD'); // Used signals[0]
  });

  it('should generate a HOLD signal for BUY if insufficient cash', async () => { // Made async
    const context = { ...baseContext };
    const currentPrice = context.historicalData[context.currentIndex].close;
    context.portfolio.cash = currentPrice * (defaultParams.tradeAmount as number) - 1; // Insufficient cash

    mockedCalculateMACD.mockReturnValue({ // BUY signal conditions
      macdLine:   Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 12 : (i === context.currentIndex - 1 ? 8 : NaN)),
      signalLine: Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 10 : (i === context.currentIndex - 1 ? 9 : NaN)),
      histogram: Array(context.historicalData.length).fill(NaN),
    });
    
    const signals = await macdStrategy.execute(context); // Awaited and changed variable name
    expect(signals[0].action).toBe('HOLD'); // Used signals[0]
  });

  it('should generate a HOLD signal for SELL if insufficient shares', async () => { // Made async
    const context = { ...baseContext };
    context.portfolio.shares = (defaultParams.tradeAmount as number) - 0.1; // Insufficient shares (assuming tradeAmount can be > shares)
     if ((defaultParams.tradeAmount as number) === 0) context.portfolio.shares = -1; // Ensure it's less if tradeAmount is 0

    mockedCalculateMACD.mockReturnValue({ // SELL signal conditions
      macdLine:   Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 8 : (i === context.currentIndex - 1 ? 12 : NaN)),
      signalLine: Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 9 : (i === context.currentIndex - 1 ? 10 : NaN)),
      histogram: Array(context.historicalData.length).fill(NaN),
    });

    const signals = await macdStrategy.execute(context); // Awaited and changed variable name
    expect(signals[0].action).toBe('HOLD'); // Used signals[0]
  });
  
   it('should generate HOLD if longPeriod is not greater than shortPeriod', async () => { // Made async
    const context = { ...baseContext };
    context.parameters.longPeriod = context.parameters.shortPeriod; // Invalid params

    // No need to mock calculateMACD, strategy should return HOLD due to param validation
    const signals = await macdStrategy.execute(context); // Awaited and changed variable name
    expect(signals[0].action).toBe('HOLD'); // Used signals[0]
  });

});
