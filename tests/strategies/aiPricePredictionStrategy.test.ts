import { aiPricePredictionStrategy } from '../../src/strategies/implementations/aiPricePredictionStrategy';
import { StrategyContext, StrategySignal } from '../../src/strategies/strategy.types';
import { HistoricalDataPoint } from '../../src/services/dataService';
import { Portfolio } from '../../src/backtest';
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
// mockModelPredict will be configured in beforeEach or specific tests
const mockModelPredict = jest.fn(); 
const mockModelDispose = jest.fn();

describe('AIPricePredictionStrategy', () => {
  let baseContext: StrategyContext<any>; 
  const defaultParams = {
    lookbackPeriod: 10,
    predictionHorizon: 1,
    trainingDataSplit: 0.7,
    epochs: 5, 
    learningRate: 0.01,
    lstmUnits: 16, 
    denseUnits: 8,
    buyThreshold: 0.6,
    sellThreshold: 0.4,
    tradeAmount: 1,
  };

  const createMockHistoricalData = (length: number, startPrice: number = 100): HistoricalDataPoint[] => {
    return Array(length).fill(null).map((_, i) => {
      const timestampInMilliseconds = Date.now() + i * 3600000; 
      return {
        timestamp: Math.floor(timestampInMilliseconds / 1000), 
        date: new Date(timestampInMilliseconds), 
        open: startPrice + i * 0.1,
        high: startPrice + i * 0.1 + 0.05,
        low: startPrice + i * 0.1 - 0.05,
        close: startPrice + i * 0.1,
        volume: 100 + i * 10,
        source_api: 'mock', 
        symbol: 'MOCK',
        interval: '1h',
      };
    });
  };
  
  beforeEach(() => {
    jest.resetAllMocks(); 
    
    mockedCreateModel.mockImplementation(() => ({
      fit: mockModelFit,
      predict: mockModelPredict, // Use the jest.fn() directly
      dispose: mockModelDispose,
      layers: [], 
    } as unknown as tf.Sequential));
    mockedCompileModel.mockImplementation(jest.fn());

    (aiPricePredictionStrategy as any).resetState(); 

    baseContext = {
      symbol: 'MOCK', 
      historicalData: createMockHistoricalData(100), 
      currentIndex: 99, 
      portfolio: { 
        cash: 10000, 
        shares: 10, 
        initialValue: 10000, 
        currentValue: 10000 + 10 * (100 + (99 * 0.1)),
        getCash: () => baseContext.portfolio.cash,
        getPosition: () => ({ quantity: baseContext.portfolio.shares, averagePrice: 100 }), 
        getTrades: () => [],
        recordTrade: jest.fn(),
        getMarketValue: () => baseContext.portfolio.currentValue,
        getHistoricalPnl: () => [],
      } as unknown as Portfolio, 
      parameters: { ...defaultParams },
      tradeHistory: [],
      signalHistory: [], 
    };

    // Default mock for predict to return a valid tensor-like object
    mockModelPredict.mockImplementation((input: tf.Tensor) => {
        // Create a dummy tensor output based on the input batch size
        const batchSize = input.shape[0] || 1;
        const predictionData = new Float32Array(batchSize);
        for(let i=0; i<batchSize; i++) predictionData[i] = (defaultParams.buyThreshold + defaultParams.sellThreshold) / 2; // Neutral prediction
        return { dataSync: jest.fn().mockReturnValue(predictionData) } as any;
    });
  });

  it('should invoke training if not already trained', async () => {
    const context = { ...baseContext };
    
    mockedCreatePriceSequences.mockReturnValue({
      sequences: [Array(defaultParams.lookbackPeriod).fill(0.1), Array(defaultParams.lookbackPeriod).fill(0.2)],
      targets: [1,0] 
    });
    mockedNormalizeData.mockReturnValue({
      normalizedSequences: [Array(defaultParams.lookbackPeriod).fill(0.1), Array(defaultParams.lookbackPeriod).fill(0.2)],
      minMax: { min: 1, max: 6 }
    });

    // Specific mock for predict during this test if training immediately leads to prediction
    mockModelPredict.mockImplementationOnce((input: tf.Tensor) => {
        const batchSize = input.shape[0] || 1;
        const predictionData = new Float32Array(batchSize);
        for(let i=0; i<batchSize; i++) predictionData[i] = (defaultParams.buyThreshold + defaultParams.sellThreshold) / 2;
        return { dataSync: jest.fn().mockReturnValue(predictionData) } as any;
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
    strategy.model = mockedCreateModel(defaultParams.lookbackPeriod, defaultParams.lstmUnits, defaultParams.denseUnits);
    strategy.normalizationParams = { min: 90, max: 110 };
    
    const context = { ...baseContext, currentIndex: defaultParams.lookbackPeriod + 5 }; 
    context.historicalData = createMockHistoricalData(context.currentIndex + 1, 100);
    (context.portfolio as any).cash = context.historicalData[context.currentIndex].close * defaultParams.tradeAmount + 1000;

    mockedNormalizeData.mockReturnValue({
      normalizedSequences: [Array(defaultParams.lookbackPeriod).fill(0.5)], 
      minMax: strategy.normalizationParams
    });
    
    // Mock predict to return a value > buyThreshold
    const predictionValue = defaultParams.buyThreshold + 0.1;
    mockModelPredict.mockImplementation(() => ({ dataSync: jest.fn().mockReturnValue(new Float32Array([predictionValue])) }) as any);

    const signal = await strategy.execute(context);

    expect(mockModelPredict).toHaveBeenCalled();
    expect(signal.action).toBe('BUY');
    expect(signal.amount).toBe(defaultParams.tradeAmount);
  });
  
  it('should make a SELL prediction after training', async () => {
    const strategy = aiPricePredictionStrategy as any;
    strategy.isTrained = true;
    strategy.model = mockedCreateModel(defaultParams.lookbackPeriod, defaultParams.lstmUnits, defaultParams.denseUnits);
    strategy.normalizationParams = { min: 90, max: 110 };

    const context = { ...baseContext, currentIndex: defaultParams.lookbackPeriod + 5 };
    context.historicalData = createMockHistoricalData(context.currentIndex + 1, 100);
    (context.portfolio as any).shares = defaultParams.tradeAmount + 1;

    mockedNormalizeData.mockReturnValue({
      normalizedSequences: [Array(defaultParams.lookbackPeriod).fill(0.5)],
      minMax: strategy.normalizationParams
    });
    // Mock predict to return a value < sellThreshold
    const predictionValue = defaultParams.sellThreshold - 0.1;
    mockModelPredict.mockImplementation(() => ({ dataSync: jest.fn().mockReturnValue(new Float32Array([predictionValue])) }) as any);

    const signal = await strategy.execute(context);
    expect(mockModelPredict).toHaveBeenCalled();
    expect(signal.action).toBe('SELL');
    expect(signal.amount).toBe(defaultParams.tradeAmount);
  });

  it('should make a HOLD prediction after training (between thresholds)', async () => {
    const strategy = aiPricePredictionStrategy as any;
    strategy.isTrained = true;
    strategy.model = mockedCreateModel(defaultParams.lookbackPeriod, defaultParams.lstmUnits, defaultParams.denseUnits);
    strategy.normalizationParams = { min: 90, max: 110 };

    const context = { ...baseContext, currentIndex: defaultParams.lookbackPeriod + 5 };
     context.historicalData = createMockHistoricalData(context.currentIndex + 1, 100);

    mockedNormalizeData.mockReturnValue({
      normalizedSequences: [Array(defaultParams.lookbackPeriod).fill(0.5)],
      minMax: strategy.normalizationParams
    });
    // Mock predict to return a value between thresholds
    const predictionValue = (defaultParams.buyThreshold + defaultParams.sellThreshold) / 2;
    mockModelPredict.mockImplementation(() => ({ dataSync: jest.fn().mockReturnValue(new Float32Array([predictionValue])) }) as any);

    const signal = await strategy.execute(context);
    expect(mockModelPredict).toHaveBeenCalled();
    expect(signal.action).toBe('HOLD');
  });

  it('should HOLD if data is insufficient for training', async () => {
    const context = { ...baseContext };
    // Minimum data needed for training is roughly lookbackPeriod / (1 - trainingSplit) + predictionHorizon
    // default: 10 / (1 - 0.7) + 1 = 10 / 0.3 + 1 = 33.33 + 1 = ~35
    // Let's set data length to something clearly insufficient, e.g., 20
    context.historicalData = createMockHistoricalData(20); 
    context.currentIndex = 19;
    
    // Ensure createPriceSequences returns empty or insufficient sequences for this scenario
    mockedCreatePriceSequences.mockReturnValue({ sequences: [], targets: [] });
    mockedNormalizeData.mockReturnValue({ normalizedSequences: [], minMax: {min:0, max:0}});


    const signal = await aiPricePredictionStrategy.execute(context);
    expect((aiPricePredictionStrategy as any).isTrained).toBe(false);
    expect(mockedCreateModel).not.toHaveBeenCalled();
    expect(signal.action).toBe('HOLD');
  });

  it('should HOLD if data is insufficient for prediction after training', async () => {
    const strategy = aiPricePredictionStrategy as any;
    strategy.isTrained = true; // Assume model is trained
    strategy.model = mockedCreateModel(defaultParams.lookbackPeriod, defaultParams.lstmUnits, defaultParams.denseUnits);
    strategy.normalizationParams = { min: 90, max: 110 };

    // Not enough data for a lookback sequence
    const context = { ...baseContext, currentIndex: defaultParams.lookbackPeriod - 2 }; 
    context.historicalData = createMockHistoricalData(defaultParams.lookbackPeriod);

    const signal = await strategy.execute(context);
    expect(mockModelPredict).not.toHaveBeenCalled();
    expect(signal.action).toBe('HOLD');
  });
  
  it('model dispose should be called on resetState', () => {
    const strategy = aiPricePredictionStrategy as any;
    strategy.model = mockedCreateModel(defaultParams.lookbackPeriod, defaultParams.lstmUnits, defaultParams.denseUnits);
    
    strategy.resetState();
    expect(mockModelDispose).toHaveBeenCalled();
  });

});
