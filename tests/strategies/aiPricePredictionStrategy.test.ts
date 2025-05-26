import { aiPricePredictionStrategy } from '../../src/strategies/implementations/aiPricePredictionStrategy';
import { StrategyContext, StrategySignal } from '../../src/strategies/strategy.types'; // Removed HistoricalDataPoint, Portfolio, StrategyParameters
import { HistoricalDataPoint } from '../../src/services/dataService'; // Added import
import { Portfolio } from '../../src/backtest'; // Added import
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
  const defaultParams: Record<string, number | string | boolean> = { // Typed parameters
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
    const now = Date.now();
    return Array(length).fill(null).map((_, i) => {
      const timestampMillis = now + i * 3600000; // hourly data
      return {
        timestamp: Math.floor(timestampMillis / 1000), // Epoch seconds
        date: new Date(timestampMillis), // Date object
        open: startPrice + i * 0.1,
        high: startPrice + i * 0.1 + 0.05,
        low: startPrice + i * 0.1 - 0.05,
        close: startPrice + i * 0.1,
        volume: 100 + i * 10,
        source_api: 'mock', // Corrected field name
        symbol: 'MOCK',
        interval: '1h',
        // fetchedAt is not part of HistoricalDataPoint
      };
    });
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
      portfolio: { cash: 10000, shares: 10, initialValue: 10000, currentValue: 10000 }, // Corrected initialCash
      parameters: { ...defaultParams },
      // These are not part of StrategyContext
      // getAvailableStrategies: jest.fn(() => []), 
      // getStrategy: jest.fn(() => undefined),   
    } as StrategyContext;
  });

  it('should invoke training if not already trained', async () => {
    const context = { ...baseContext };
    // Training uses historicalData.length * trainingDataSplit
    // Ensure currentIndex allows for sufficient data for training and subsequent lookback for prediction
    context.currentIndex = Math.floor(context.historicalData.length * (defaultParams.trainingDataSplit as number)) + (defaultParams.lookbackPeriod as number) + 1;
    if (context.currentIndex >= context.historicalData.length) {
        context.currentIndex = context.historicalData.length - 1;
    }
    // Ensure historicalData is long enough for this currentIndex
    if (context.historicalData.length <= context.currentIndex) {
        context.historicalData = createMockHistoricalData(context.currentIndex + 50); // Add more data if needed
    }
    
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
    // We will not set strategy.isTrained or strategy.model here.
    // The strategy should train itself if not trained.
    // We need to ensure the context.currentIndex is such that after training,
    // there's still data for the prediction part of execute.
    
    const context = { ...baseContext };
    // Ensure currentIndex is far enough for training to occur and then a prediction to be made
    const trainingDataEndIndex = Math.floor(context.historicalData.length * (defaultParams.trainingDataSplit as number));
    context.currentIndex = trainingDataEndIndex + (defaultParams.lookbackPeriod as number) + 1;
    // Ensure historicalData is long enough for this currentIndex
    if (context.historicalData.length <= context.currentIndex) {
      context.historicalData = createMockHistoricalData(context.currentIndex + 50); // Add more data if needed
    }
    context.portfolio.cash = context.historicalData[context.currentIndex].close * (defaultParams.tradeAmount as number) + 1000;

    // Mock for training part
    mockedCreatePriceSequences.mockReturnValueOnce({ sequences: [[1,2,3]], targets: [1] });
    mockedNormalizeData.mockReturnValueOnce({ normalizedSequences: [[0.1,0.2,0.3]], minMax: { min: 1, max: 3 } });
    // Mock for prediction part
    mockedNormalizeData.mockReturnValueOnce({
      normalizedSequences: [Array(defaultParams.lookbackPeriod as number).fill(0.5)],
      minMax: { min: 90, max: 110 } // This will be set by strategy.normalizationParams after training
    });
    mockModelPredict.mockImplementation(() => tf.tidy(() => tf.tensor2d([[(defaultParams.buyThreshold as number) + 0.1]])));

    const signals = await strategy.execute(context); // Should trigger training then prediction

    expect(strategy.isTrained).toBe(true); // Verify training happened
    expect(mockModelPredict).toHaveBeenCalled();
    expect(signals[0].action).toBe('BUY'); // Access first signal in array
    expect(signals[0].amount).toBe(defaultParams.tradeAmount); // Access first signal in array
  });
  
  it('should make a SELL prediction after training', async () => {
    const strategy = aiPricePredictionStrategy as any;
    const context = { ...baseContext };
    const trainingDataEndIndex = Math.floor(context.historicalData.length * (defaultParams.trainingDataSplit as number));
    context.currentIndex = trainingDataEndIndex + (defaultParams.lookbackPeriod as number) + 1;
    if (context.historicalData.length <= context.currentIndex) {
      context.historicalData = createMockHistoricalData(context.currentIndex + 50);
    }
    context.portfolio.shares = (defaultParams.tradeAmount as number) + 1;

    mockedCreatePriceSequences.mockReturnValueOnce({ sequences: [[1,2,3]], targets: [1] });
    mockedNormalizeData.mockReturnValueOnce({ normalizedSequences: [[0.1,0.2,0.3]], minMax: { min: 1, max: 3 } });
    mockedNormalizeData.mockReturnValueOnce({
      normalizedSequences: [Array(defaultParams.lookbackPeriod as number).fill(0.5)],
      minMax: { min: 90, max: 110 }
    });
    mockModelPredict.mockImplementation(() => tf.tidy(() => tf.tensor2d([[(defaultParams.sellThreshold as number) - 0.1]])));

    const signals = await strategy.execute(context);
    expect(strategy.isTrained).toBe(true);
    expect(mockModelPredict).toHaveBeenCalled();
    expect(signals[0].action).toBe('SELL'); // Access first signal in array
    expect(signals[0].amount).toBe(defaultParams.tradeAmount); // Access first signal in array
  });

  it('should make a HOLD prediction after training (between thresholds)', async () => {
    const strategy = aiPricePredictionStrategy as any;
    const context = { ...baseContext };
    const trainingDataEndIndex = Math.floor(context.historicalData.length * (defaultParams.trainingDataSplit as number));
    context.currentIndex = trainingDataEndIndex + (defaultParams.lookbackPeriod as number) + 1;
    if (context.historicalData.length <= context.currentIndex) {
      context.historicalData = createMockHistoricalData(context.currentIndex + 50);
    }

    mockedCreatePriceSequences.mockReturnValueOnce({ sequences: [[1,2,3]], targets: [1] });
    mockedNormalizeData.mockReturnValueOnce({ normalizedSequences: [[0.1,0.2,0.3]], minMax: { min: 1, max: 3 } });
    mockedNormalizeData.mockReturnValueOnce({
      normalizedSequences: [Array(defaultParams.lookbackPeriod as number).fill(0.5)],
      minMax: { min: 90, max: 110 }
    });
    mockModelPredict.mockImplementation(() => tf.tidy(() => tf.tensor2d([[((defaultParams.buyThreshold as number) + (defaultParams.sellThreshold as number)) / 2 ]])));

    const signals = await strategy.execute(context);
    expect(strategy.isTrained).toBe(true);
    expect(mockModelPredict).toHaveBeenCalled();
    expect(signals[0].action).toBe('HOLD'); // Access first signal in array
  });

  it('should HOLD if data is insufficient for training', async () => {
    const context = { ...baseContext };
    // Data length just enough for lookback + horizon, but not for split AND then lookback + horizon
    context.historicalData = createMockHistoricalData(
      (defaultParams.lookbackPeriod as number) + (defaultParams.predictionHorizon as number)
    ); 
    
    const signals = await aiPricePredictionStrategy.execute(context);
    expect((aiPricePredictionStrategy as any).isTrained).toBe(false);
    expect(mockedCreateModel).not.toHaveBeenCalled();
    expect(signals[0].action).toBe('HOLD'); // Access first signal in array
  });

  it('should HOLD if data is insufficient for prediction after training', async () => {
    const strategy = aiPricePredictionStrategy as any;
    // Manually set isTrained to true but provide insufficient data for prediction lookback
    strategy.isTrained = true; 
    strategy.model = mockedCreateModel( // Ensure model is created with expected params if accessed
        defaultParams.lookbackPeriod as number, 
        defaultParams.lstmUnits as number, 
        defaultParams.denseUnits as number
    );
    strategy.normalizationParams = { min: 90, max: 110 };

    const context = { ...baseContext, currentIndex: (defaultParams.lookbackPeriod as number) - 2 }; 
    context.historicalData = createMockHistoricalData(defaultParams.lookbackPeriod as number);


    const signals = await strategy.execute(context);
    expect(mockModelPredict).not.toHaveBeenCalled(); // Prediction shouldn't be attempted
    expect(signals[0].action).toBe('HOLD'); // Access first signal in array
  });
  
  it('model dispose should be called on resetState', () => {
    const strategy = aiPricePredictionStrategy as any;
    // Ensure a model exists to be disposed
    strategy.model = mockedCreateModel(
        defaultParams.lookbackPeriod as number, 
        defaultParams.lstmUnits as number, 
        defaultParams.denseUnits as number
    ); 
    
    strategy.resetState();
    expect(mockModelDispose).toHaveBeenCalled(); // Check if dispose was called on the model
  });

});
