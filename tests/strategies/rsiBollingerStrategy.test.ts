import { rsiBollingerStrategy } from '../../src/strategies/implementations/rsiBollingerStrategy';
// Removed StrategyParameters from import as it's unused and not exported
import { StrategyContext, StrategySignal } from '../../src/strategies/strategy.types'; // Portfolio removed
import { Portfolio } from '../../src/backtest'; // Portfolio imported from backtest
import { HistoricalDataPoint } from '../../src/services/dataService'; // Assuming this is the correct path
import { calculateRSI, calculateBollingerBands } from '../../src/utils/technicalIndicators';

// Mock the technical indicator functions
jest.mock('../../src/utils/technicalIndicators');

// Cast the mocked functions to Jest's mock type
const mockedCalculateRSI = calculateRSI as jest.MockedFunction<typeof calculateRSI>;
const mockedCalculateBollingerBands = calculateBollingerBands as jest.MockedFunction<typeof calculateBollingerBands>;

describe('RSI Bollinger Strategy', () => {
  let baseContext: StrategyContext;
  const defaultParams = {
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    bollingerPeriod: 20,
    bollingerStdDev: 2,
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
        // fetchedAt is not part of HistoricalDataPoint, it's from FinancialData
      };
    });
  };

  beforeEach(() => {
    // Reset mocks before each test
    mockedCalculateRSI.mockReset();
    mockedCalculateBollingerBands.mockReset();

    baseContext = {
      historicalData: createMockHistoricalData(50, 100), // Sufficient data for most tests
      currentIndex: 49, // Default to the last point
      portfolio: { cash: 1000, shares: 10, initialCash: 1000, trades: [] },
      parameters: { ...defaultParams },
      tradeHistory: [], // Added missing property
      // Removed getAvailableStrategies and getStrategy as they are not part of StrategyContext
    };
  });

  // Test cases will go here
  it('should generate a BUY signal when RSI is oversold and price is at/below lower Bollinger Band', async () => { // Made async
    const context = { ...baseContext };
    context.parameters.rsiOversold = 30;
    context.historicalData[context.currentIndex].close = 95; // Price at lower band

    mockedCalculateRSI.mockReturnValue(
      Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 25 : NaN) // RSI is 25 (oversold)
    );
    mockedCalculateBollingerBands.mockReturnValue({
      middle: Array(context.historicalData.length).fill(100),
      upper: Array(context.historicalData.length).fill(105),
      lower: Array(context.historicalData.length).fill(95).map((_, i) => i === context.currentIndex ? 95 : NaN), // Lower band is 95
    });

    const signal = await Promise.resolve(rsiBollingerStrategy.execute(context)); // Added await Promise.resolve
    expect(signal.action).toBe('BUY');
    expect(signal.amount).toBe(defaultParams.tradeAmount);
  });

  it('should generate a SELL signal when RSI is overbought and price is at/above upper Bollinger Band', async () => { // Made async
    const context = { ...baseContext };
    context.parameters.rsiOverbought = 70;
    context.historicalData[context.currentIndex].close = 105; // Price at upper band

    mockedCalculateRSI.mockReturnValue(
      Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 75 : NaN) // RSI is 75 (overbought)
    );
    mockedCalculateBollingerBands.mockReturnValue({
      middle: Array(context.historicalData.length).fill(100),
      upper: Array(context.historicalData.length).fill(105).map((_, i) => i === context.currentIndex ? 105 : NaN), // Upper band is 105
      lower: Array(context.historicalData.length).fill(95),
    });

    const signal = await Promise.resolve(rsiBollingerStrategy.execute(context)); // Added await Promise.resolve
    expect(signal.action).toBe('SELL');
    expect(signal.amount).toBe(defaultParams.tradeAmount);
  });

  it('should generate a HOLD signal when RSI is neutral', async () => { // Made async
    const context = { ...baseContext };
    context.historicalData[context.currentIndex].close = 95; // Price at lower band

    mockedCalculateRSI.mockReturnValue(
      Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 50 : NaN) // RSI is 50 (neutral)
    );
    mockedCalculateBollingerBands.mockReturnValue({
      middle: Array(context.historicalData.length).fill(100),
      upper: Array(context.historicalData.length).fill(105),
      lower: Array(context.historicalData.length).fill(95).map((_, i) => i === context.currentIndex ? 95 : NaN),
    });

    const signal = await Promise.resolve(rsiBollingerStrategy.execute(context)); // Added await Promise.resolve
    expect(signal.action).toBe('HOLD');
  });

  it('should generate a HOLD signal when RSI is oversold but price is above lower Bollinger Band', async () => { // Made async
    const context = { ...baseContext };
    context.parameters.rsiOversold = 30;
    context.historicalData[context.currentIndex].close = 97; // Price above lower band

    mockedCalculateRSI.mockReturnValue(
      Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 25 : NaN) // RSI is 25 (oversold)
    );
    mockedCalculateBollingerBands.mockReturnValue({
      middle: Array(context.historicalData.length).fill(100),
      upper: Array(context.historicalData.length).fill(105),
      lower: Array(context.historicalData.length).fill(95).map((_, i) => i === context.currentIndex ? 95 : NaN), // Lower band is 95
    });
    
    const signal = await Promise.resolve(rsiBollingerStrategy.execute(context)); // Added await Promise.resolve
    expect(signal.action).toBe('HOLD');
  });
  
  it('should generate a HOLD signal if RSI is NaN', async () => { // Made async
    const context = { ...baseContext };
    context.historicalData[context.currentIndex].close = 95;

    mockedCalculateRSI.mockReturnValue(
      Array(context.historicalData.length).fill(NaN) // All RSI values are NaN
    );
    mockedCalculateBollingerBands.mockReturnValue({
      middle: Array(context.historicalData.length).fill(100),
      upper: Array(context.historicalData.length).fill(105),
      lower: Array(context.historicalData.length).fill(95).map((_, i) => i === context.currentIndex ? 95 : NaN),
    });

    const signal = await Promise.resolve(rsiBollingerStrategy.execute(context)); // Added await Promise.resolve
    expect(signal.action).toBe('HOLD');
  });

  it('should generate a HOLD signal if Bollinger Bands are NaN', async () => { // Made async
    const context = { ...baseContext };
    mockedCalculateRSI.mockReturnValue(
      Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 25 : NaN)
    );
    mockedCalculateBollingerBands.mockReturnValue({ // All BB values are NaN
      middle: Array(context.historicalData.length).fill(NaN),
      upper: Array(context.historicalData.length).fill(NaN),
      lower: Array(context.historicalData.length).fill(NaN),
    });

    const signal = await Promise.resolve(rsiBollingerStrategy.execute(context)); // Added await Promise.resolve
    expect(signal.action).toBe('HOLD');
  });
  
  it('should generate a HOLD signal for BUY if insufficient cash', async () => { // Made async
    const context = { ...baseContext };
    context.portfolio.cash = 50; // Insufficient cash (price is 95, tradeAmount is 1)
    context.parameters.rsiOversold = 30;
    context.historicalData[context.currentIndex].close = 95;

    mockedCalculateRSI.mockReturnValue(
      Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 25 : NaN)
    );
    mockedCalculateBollingerBands.mockReturnValue({
      middle: Array(context.historicalData.length).fill(100),
      upper: Array(context.historicalData.length).fill(105),
      lower: Array(context.historicalData.length).fill(95).map((_, i) => i === context.currentIndex ? 95 : NaN),
    });

    const signal = await Promise.resolve(rsiBollingerStrategy.execute(context)); // Added await Promise.resolve
    expect(signal.action).toBe('HOLD');
  });

  it('should generate a HOLD signal for SELL if insufficient shares', async () => { // Made async
    const context = { ...baseContext };
    context.portfolio.shares = 0; // Insufficient shares
    context.parameters.rsiOverbought = 70;
    context.historicalData[context.currentIndex].close = 105;

    mockedCalculateRSI.mockReturnValue(
      Array(context.historicalData.length).fill(NaN).map((_, i) => i === context.currentIndex ? 75 : NaN)
    );
    mockedCalculateBollingerBands.mockReturnValue({
      middle: Array(context.historicalData.length).fill(100),
      upper: Array(context.historicalData.length).fill(105).map((_, i) => i === context.currentIndex ? 105 : NaN),
      lower: Array(context.historicalData.length).fill(95),
    });

    const signal = await Promise.resolve(rsiBollingerStrategy.execute(context)); // Added await Promise.resolve
    expect(signal.action).toBe('HOLD');
  });
  
  it('should handle insufficient data for indicators (short historicalData array)', async () => { // Made async
    const context = { ...baseContext };
    // The strategy itself has a check: currentIndex < requiredDataLength -1
    // requiredDataLength = Math.max(rsiPeriod + 1, bollingerPeriod +1);
    // default rsiPeriod=14, bollingerPeriod=20. So required = 21.
    // If currentIndex < 20, it should hold.
    context.currentIndex = 5; // Not enough data for default periods
    context.historicalData = createMockHistoricalData(10, 100); // Short data

    // No need to mock indicator returns here if we want to test the strategy's internal length check.
    // The strategy's own check `if (currentIndex < requiredDataLength -1)` should trigger.
    // If that check wasn't there, then we'd test by having indicators return NaNs.

    const signal = await Promise.resolve(rsiBollingerStrategy.execute(context)); // Added await Promise.resolve
    expect(signal.action).toBe('HOLD');
  });

});
