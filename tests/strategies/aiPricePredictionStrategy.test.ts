import { aiPricePredictionStrategy } from '../../src/strategies/implementations/aiPricePredictionStrategy';
import { StrategyContext, StrategySignal, HistoricalDataPoint, Portfolio, StrategyParameters } from '../../src/strategies/strategy.types';
import * as tf from '@tensorflow/tfjs-node';
import { createPriceSequences, normalizeData } from '../../src/utils/aiDataUtils';
import { createModel, compileModel } from '../../src/aiModels/simplePricePredictorModel';

// Mock modules
jest.mock('../../src/utils/aiDataUtils');
jest.mock('../../src/aiModels/simplePricePredictorModel');

// Typed Mocks for imported functions
const mockedCreatePriceSequences = createPriceSequences as jest.MockedFunction<typeof createPriceSequences>;
const mockedNormalizeData = normalizeData as jest.MockedFunction<typeof normalizeData>;
const mockedCreateModel = createModel as jest.MockedFunction<typeof createModel>;
const mockedCompileModel = compileModel as jest.MockedFunction<typeof compileModel>;

// Mocks for TensorFlow model methods
const mockModelFit = jest.fn().mockResolvedValue({ history: { loss: [0.1], acc: [0.9] } });
const mockModelPredict = jest.fn();
const mockModelDispose = jest.fn();

// Mock tf.tensor related functions that might be called internally if not fully mocked out by higher level fns
// This is to prevent actual tensor operations if any slip through mocks during setup.
// jest.spyOn(tf, 'tensor2d').mockImplementation(() => tf.Tensor.make([0], [1,1], 'float32') as any); // Return a dummy tensor
// jest.spyOn(tf, 'tensor1d').mockImplementation(() => tf.Tensor.make([0], [1], 'float32') as any);
// The above tensor mocks are tricky because reshape and other methods would also need mocking.
// It's better to ensure the mocked model methods handle tensor interactions.

describe('AIPricePredictionStrategy', () => {
  let baseContext: StrategyContext;
  const defaultParams = {
    lookbackPeriod: 10,
    predictionHorizon: 1,
    trainingDataSplit: 0.7,
    epochs: 5, // Keep epochs low for tests
    learningRate: 0.01,
    lstmUnits: 16, // Smaller units for tests
    denseUnits: 8,
    buyThreshold: 0.6,
    sellThreshold: 0.4,
    tradeAmount: 1,
  };

  const createMockHistoricalData = (length: number, startPrice: number = 100): HistoricalDataPoint[] => {
    return Array(length).fill(null).map((_, i) => ({
      timestamp: Date.now() + i * 3600000, // hourly data
      open: startPrice + i * 0.1,
      high: startPrice + i * 0.1 + 0.05,
      low: startPrice + i * 0.1 - 0.05,
      close: startPrice + i * 0.1,
      volume: 100 + i * 10,
      sourceApi: 'mock',
      symbol: 'MOCK',
      interval: '1h',
      fetchedAt: Date.now(),
    }));
  };
  
  const mockTensor = (shape: number[] = [1]) => {
      const buffer = tf.buffer(shape, 'float32');
      for (let i = 0; i < buffer.values.length; i++) {
          buffer.values[i] = Math.random();
      }
      return buffer.toTensor();
  };


  beforeEach(() => {
    jest.resetAllMocks(); // Resets all mocks, including jest.mock, spyOn, etc.
    
    // Re-configure mocks for model creation and compilation after reset
    mockedCreateModel.mockImplementation(() => ({
      fit: mockModelFit,
      predict: mockModelPredict,
      dispose: mockModelDispose,
      layers: [], // Simplified model structure for tests
      // Add other tf.Sequential properties if your code uses them and they cause errors
    } as unknown as tf.Sequential));
    mockedCompileModel.mockImplementation(jest.fn());


    (aiPricePredictionStrategy as any).resetState(); // Reset strategy state

    baseContext = {
      historicalData: createMockHistoricalData(100), // e.g., 100 data points
      currentIndex: 99, // Default to the last point for prediction tests after training
      portfolio: { cash: 10000, shares: 10, initialCash: 10000, trades: [] },
      parameters: { ...defaultParams },
      getAvailableStrategies: jest.fn(() => []), // Not used by this strategy
      getStrategy: jest.fn(() => undefined),   // Not used by this strategy
    };
  });

  it('should invoke training if not already trained', async () => {
    const context = { ...baseContext };
    // currentIndex needs to be beyond training split for this test to be meaningful for a prediction later
    // but for just testing training invocation, any currentIndex where data is sufficient is fine.
    // Training uses historicalData.length * trainingDataSplit
    
    mockedCreatePriceSequences.mockReturnValue({
      sequences: [[1,2,3],[4,5,6]],
      targets: [1,0]
    });
    mockedNormalizeData.mockReturnValue({
      normalizedSequences: [[0.1,0.2,0.3],[0.4,0.5,0.6]],
      minMax: { min: 1, max: 6 }
    });

    await aiPricePredictionStrategy.execute(context);

    expect((aiPricePredictionStrategy as any).isTrained).toBe(true);
    expect(mockedCreateModel).toHaveBeenCalledWith(defaultParams.lookbackPeriod, defaultParams.lstmUnits, defaultParams.denseUnits);
    expect(mockedCompileModel).toHaveBeenCalled();
    expect(mockModelFit).toHaveBeenCalled();
    expect((aiPricePredictionStrategy as any).normalizationParams).toEqual({ min: 1, max: 6 });
  });

  it('should make a BUY prediction after training', async () => {
    const strategy = aiPricePredictionStrategy as any;
    strategy.isTrained = true;
    strategy.model = mockedCreateModel(); // Get a fresh mock model instance
    strategy.normalizationParams = { min: 90, max: 110 };
    
    const context = { ...baseContext, currentIndex: defaultParams.lookbackPeriod + 5 }; // Ensure enough data for lookback
    context.historicalData = createMockHistoricalData(context.currentIndex + 1, 100);
     context.portfolio.cash = context.historicalData[context.currentIndex].close * defaultParams.tradeAmount + 1000;


    mockedNormalizeData.mockReturnValue({
      normalizedSequences: [Array(defaultParams.lookbackPeriod).fill(0.5)], // Mocked normalized sequence
      minMax: strategy.normalizationParams
    });
    
    // Mock prediction tensor - tf.tidy helps dispose of it
    mockModelPredict.mockImplementation(() => tf.tidy(() => tf.tensor2d([[defaultParams.buyThreshold + 0.1]]))); // Prediction > buyThreshold

    const signal = await strategy.execute(context);

    expect(mockModelPredict).toHaveBeenCalled();
    expect(signal.action).toBe('BUY');
    expect(signal.amount).toBe(defaultParams.tradeAmount);
  });
  
  it('should make a SELL prediction after training', async () => {
    const strategy = aiPricePredictionStrategy as any;
    strategy.isTrained = true;
    strategy.model = mockedCreateModel();
    strategy.normalizationParams = { min: 90, max: 110 };

    const context = { ...baseContext, currentIndex: defaultParams.lookbackPeriod + 5 };
    context.historicalData = createMockHistoricalData(context.currentIndex + 1, 100);
    context.portfolio.shares = defaultParams.tradeAmount + 1;


    mockedNormalizeData.mockReturnValue({
      normalizedSequences: [Array(defaultParams.lookbackPeriod).fill(0.5)],
      minMax: strategy.normalizationParams
    });
    mockModelPredict.mockImplementation(() => tf.tidy(() => tf.tensor2d([[defaultParams.sellThreshold - 0.1]]))); // Prediction < sellThreshold

    const signal = await strategy.execute(context);
    expect(mockModelPredict).toHaveBeenCalled();
    expect(signal.action).toBe('SELL');
    expect(signal.amount).toBe(defaultParams.tradeAmount);
  });

  it('should make a HOLD prediction after training (between thresholds)', async () => {
    const strategy = aiPricePredictionStrategy as any;
    strategy.isTrained = true;
    strategy.model = mockedCreateModel();
    strategy.normalizationParams = { min: 90, max: 110 };

    const context = { ...baseContext, currentIndex: defaultParams.lookbackPeriod + 5 };
     context.historicalData = createMockHistoricalData(context.currentIndex + 1, 100);

    mockedNormalizeData.mockReturnValue({
      normalizedSequences: [Array(defaultParams.lookbackPeriod).fill(0.5)],
      minMax: strategy.normalizationParams
    });
    mockModelPredict.mockImplementation(() => tf.tidy(() => tf.tensor2d([[(defaultParams.buyThreshold + defaultParams.sellThreshold) / 2 ]]))); // Prediction between thresholds

    const signal = await strategy.execute(context);
    expect(mockModelPredict).toHaveBeenCalled();
    expect(signal.action).toBe('HOLD');
  });

  it('should HOLD if data is insufficient for training', async () => {
    const context = { ...baseContext };
    // Data length just enough for lookback + horizon, but not for split AND then lookback + horizon
    context.historicalData = createMockHistoricalData(defaultParams.lookbackPeriod + defaultParams.predictionHorizon); 
    
    const signal = await aiPricePredictionStrategy.execute(context);
    expect((aiPricePredictionStrategy as any).isTrained).toBe(false);
    expect(mockedCreateModel).not.toHaveBeenCalled();
    expect(signal.action).toBe('HOLD');
  });

  it('should HOLD if data is insufficient for prediction after training', async () => {
    const strategy = aiPricePredictionStrategy as any;
    strategy.isTrained = true;
    strategy.model = mockedCreateModel();
    strategy.normalizationParams = { min: 90, max: 110 };

    const context = { ...baseContext, currentIndex: defaultParams.lookbackPeriod - 2 }; // Not enough for lookback
    context.historicalData = createMockHistoricalData(defaultParams.lookbackPeriod);


    const signal = await strategy.execute(context);
    expect(mockModelPredict).not.toHaveBeenCalled();
    expect(signal.action).toBe('HOLD');
  });
  
  it('model dispose should be called on resetState', () => {
    const strategy = aiPricePredictionStrategy as any;
    strategy.model = mockedCreateModel(); // Assign a mock model
    
    strategy.resetState();
    expect(mockModelDispose).toHaveBeenCalled();
  });

});
