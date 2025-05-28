import { aiSelectorStrategy, getAISelectorActiveState, AISelectorChoiceState } from '../../src/strategies/implementations/aiSelectorStrategy';
import * as StrategyManagerModule from '../../src/strategies/strategyManager'; 
import { TradingStrategy, StrategyContext, StrategySignal, StrategyParameterDefinition, AIDecision } from '../../src/strategies/strategy.types';
import logger from '../../src/utils/logger'; 
import { HistoricalDataPoint } from '../../src/services/dataService'; 
import { Portfolio } from '../../src/backtest'; 

// Mock logger
// We need to ensure that strategyManager.ts gets this mocked version when it's imported by aiSelectorStrategy.ts
// A common way is to ensure this mock is hoisted by Jest.
// If direct jest.mock at top-level isn't enough, jest.doMock before specific imports might be needed,
// but that's more complex if aiSelectorStrategy itself is the primary module under test.
jest.mock('../../src/utils/logger', () => ({
  __esModule: true, // This helps with default exports
  default: { 
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    silly: jest.fn(),
  }
}));

// Mock StrategyManager
// This mock will apply to imports of '../../src/strategies/strategyManager'
// in both this test file AND in aiSelectorStrategy.ts (if Jest's module system handles it correctly)
jest.mock('../../src/strategies/strategyManager', () => ({
  __esModule: true,
  getAvailableStrategies: jest.fn(),
  getStrategy: jest.fn(),
}));


// Helper to create dummy strategies
const createDummyStrategy = (id: string, name: string, executeMock = jest.fn().mockResolvedValue({ action: 'HOLD' } as StrategySignal)): TradingStrategy => ({
  id,
  name,
  description: `Dummy strategy ${name}`,
  parameters: [ 
    { name: 'param1', type: 'number', defaultValue: 10, label: 'Param 1', description: 'desc' } as StrategyParameterDefinition,
  ],
  execute: executeMock,
});

// Mock Portfolio's getPosition method type
interface MockPosition {
  quantity: number;
  averagePrice: number;
}
interface MockPortfolio extends Omit<Portfolio, 'getPosition' | 'getTrades' | 'recordTrade' | 'getMarketValue' | 'getHistoricalPnl' | 'getCash'> {
  getPosition: () => MockPosition | undefined;
  getCash: () => number;
  getTrades: () => any[]; 
  recordTrade: jest.Mock;
  getMarketValue: () => number;
  getHistoricalPnl: () => any[]; 
}


describe('AISelectorStrategy Execution', () => {
  let mockContext: StrategyContext<any>;
  let stratA_execute: jest.Mock;
  let stratB_execute: jest.Mock;
  let dummyStratA: TradingStrategy;
  let dummyStratB: TradingStrategy;
  let dummyStratC_BuyAndWin: TradingStrategy;


  const sampleHistoricalData: HistoricalDataPoint[] = Array.from({ length: 50 }, (_, i) => ({
    timestamp: Math.floor((Date.now() - (50 - i) * 24 * 60 * 60 * 1000)/1000), 
    date: new Date(Date.now() - (50 - i) * 24 * 60 * 60 * 1000),
    open: 100 + i,
    high: 110 + i,
    low: 90 + i,
    close: 105 + i, 
    volume: 1000 + i * 10,
    symbol: 'TESTSYM',
    source_api: 'test', 
    interval: '1d',     
  }));

  beforeEach(() => {
    jest.clearAllMocks(); 

    if ((aiSelectorStrategy as any).currentChoicesBySymbol) {
        (aiSelectorStrategy as any).currentChoicesBySymbol.clear();
    }
    if ((aiSelectorStrategy as any).optimizedParamsForChoice) {
        (aiSelectorStrategy as any).optimizedParamsForChoice.clear();
    }
    if ((aiSelectorStrategy as any).lastAIDecision) {
        (aiSelectorStrategy as any).lastAIDecision = null;
    }


    stratA_execute = jest.fn().mockResolvedValue({ action: 'HOLD' } as StrategySignal);
    stratB_execute = jest.fn().mockResolvedValue({ action: 'HOLD' } as StrategySignal);


    dummyStratA = createDummyStrategy('stratA', 'Strategy A', stratA_execute);
    dummyStratB = createDummyStrategy('stratB', 'Strategy B', stratB_execute);
    
    dummyStratC_BuyAndWin = createDummyStrategy('stratC_BuyAndWin', 'Strategy C Buy and Win', 
      jest.fn().mockImplementation(async (ctx: StrategyContext<any>) => {
        const portfolio = ctx.portfolio as MockPortfolio;
        const position = portfolio.getPosition();
        if (position?.quantity === 0) return { action: 'BUY' } as StrategySignal;
        return { action: 'HOLD' } as StrategySignal;
      })
    );

    const mockPortfolioInstance: MockPortfolio = {
        cash: 10000,
        shares: 0,
        initialValue: 10000,
        currentValue: 10000,
        getPosition: jest.fn().mockReturnValue({ quantity: 0, averagePrice: 0 }),
        getCash: () => mockPortfolioInstance.cash,
        getTrades: () => [],
        recordTrade: jest.fn(),
        getMarketValue: () => mockPortfolioInstance.currentValue,
        getHistoricalPnl: () => [],
    };


    mockContext = {
      symbol: 'TESTSYM',
      historicalData: sampleHistoricalData,
      currentIndex: 49, 
      parameters: {
        evaluationLookbackPeriod: 30,
        candidateStrategyIds: '', 
        evaluationMetric: 'pnl', 
      },
      portfolio: mockPortfolioInstance as any, 
      signalHistory: [],
      tradeHistory: [], 
    };
    
    (StrategyManagerModule.getStrategy as jest.Mock).mockImplementation(id => {
        if (id === 'stratA') return dummyStratA;
        if (id === 'stratB') return dummyStratB;
        if (id === 'stratC_BuyAndWin') return dummyStratC_BuyAndWin;
        return undefined;
    });
    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratA, dummyStratB, dummyStratC_BuyAndWin]);
  });

  test('Test Case 1: Basic Selection - StratA wins P&L', async () => {
    stratA_execute.mockImplementation(async (ctx: StrategyContext<any>) => {
      const portfolio = ctx.portfolio as MockPortfolio;
      const position = portfolio.getPosition();
      if (ctx.currentIndex === 0 && position?.quantity === 0) return { action: 'BUY' } as StrategySignal;
      return { action: 'HOLD' } as StrategySignal;
    });
    stratB_execute.mockResolvedValue({ action: 'HOLD' } as StrategySignal);

    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratA, dummyStratB]);
    
    const resultSignal = await aiSelectorStrategy.execute(mockContext);

    expect(stratA_execute).toHaveBeenCalledWith(mockContext); 
    expect(stratB_execute).not.toHaveBeenCalledWith(mockContext);

    expect(resultSignal.action).toBe('BUY'); 
    
    const choices = getAISelectorActiveState('TESTSYM');
    expect(choices.chosenStrategyId).toBe('stratA');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy stratA"));
  });

  test('Test Case 2: No Candidate Strategies', async () => {
    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([]); 
    
    const resultSignal = await aiSelectorStrategy.execute(mockContext);
    
    expect(resultSignal.action).toBe('HOLD');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No candidate strategies found'));
    const choices = getAISelectorActiveState('TESTSYM');
    expect(choices.chosenStrategyId).toBeNull();
  });

   test('Test Case 2b: No Candidate Strategies (only self)', async () => {
    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([aiSelectorStrategy]); 
    
    const resultSignal = await aiSelectorStrategy.execute(mockContext);
    
    expect(resultSignal.action).toBe('HOLD');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No candidate strategies found'));
    const choices = getAISelectorActiveState('TESTSYM');
    expect(choices.chosenStrategyId).toBeNull();
  });

  test('Test Case 3: Insufficient Data for Evaluation', async () => {
    mockContext.currentIndex = 20; 
    mockContext.parameters.evaluationLookbackPeriod = 30;

    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratA, dummyStratB]);
    
    const resultSignal = await aiSelectorStrategy.execute(mockContext);
    
    expect(resultSignal.action).toBe('HOLD');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Not enough historical data for evaluation'));
  });
  
  test('Test Case 3b: Insufficient Evaluation Data Length after slice', async () => {
    mockContext.historicalData = sampleHistoricalData.slice(0,15); 
    mockContext.currentIndex = 14; 
    mockContext.parameters.evaluationLookbackPeriod = 20; 

    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratA, dummyStratB]);
        
    const resultSignal = await aiSelectorStrategy.execute(mockContext);
    
    expect(resultSignal.action).toBe('HOLD');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Insufficient evaluation data length'));
  });


  test('Test Case 4: Candidate Strategies use Default Parameters', async () => {
    const mockParamStrategyExecute = jest.fn().mockResolvedValue({ action: 'BUY' } as StrategySignal);
    const paramStrategy = {
      ...createDummyStrategy('paramStrat', 'Param Strat', mockParamStrategyExecute),
      parameters: [ 
        { name: 'importantParam', type: 'number', defaultValue: 123, label: 'Imp Param', description: 'desc' } as StrategyParameterDefinition,
      ]
    };
    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([paramStrategy]);
    (StrategyManagerModule.getStrategy as jest.Mock).mockReturnValue(paramStrategy);

    await aiSelectorStrategy.execute(mockContext);

    const simulationCalls = mockParamStrategyExecute.mock.calls.filter(call => {
      const ctx = call[0] as StrategyContext<any>;
      return ctx.historicalData.length === mockContext.parameters.evaluationLookbackPeriod;
    });
    
    expect(simulationCalls.length).toBeGreaterThan(0);
    expect(simulationCalls[0][0].parameters.importantParam).toBe(123);

    const finalCall = mockParamStrategyExecute.mock.calls.find(call => {
        const ctx = call[0] as StrategyContext<any>;
        return ctx.historicalData === mockContext.historicalData; 
    });
    expect(finalCall).toBeDefined();
    expect(finalCall![0].parameters.importantParam).toBe(123); 
  });

  test('Test Case 5: P&L Simulation Logic - BuyAndWin vs Hold', async () => {
    const holdExecute = jest.fn().mockResolvedValue({ action: 'HOLD' } as StrategySignal);
    const alwaysHoldStrat = createDummyStrategy('alwaysHold', 'Always Hold', holdExecute);

    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratC_BuyAndWin, alwaysHoldStrat]);
    (StrategyManagerModule.getStrategy as jest.Mock).mockImplementation(id => {
        if (id === 'stratC_BuyAndWin') return dummyStratC_BuyAndWin;
        if (id === 'alwaysHold') return alwaysHoldStrat;
        return undefined;
    });
    
    await aiSelectorStrategy.execute(mockContext);
    
    const choices = getAISelectorActiveState('TESTSYM');
    expect(choices.chosenStrategyId).toBe('stratC_BuyAndWin');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy stratC_BuyAndWin"));
    expect(dummyStratC_BuyAndWin.execute).toHaveBeenCalledWith(mockContext);
    expect(holdExecute).not.toHaveBeenCalledWith(mockContext);
  });

  test('Test Case 5b: P&L Simulation - Hold wins vs BuyAndLose (prices decreasing)', async () => {
    const decreasingPriceData: HistoricalDataPoint[] = Array.from({ length: 30 }, (_, i) => ({
        timestamp: Math.floor((Date.now() - (30 - i) * 24 * 60 * 60 * 1000)/1000),
        date: new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000),
        open: 100 - i, high: 110 - i, low: 90 - i, close: 95 - i, 
        volume: 1000 + i * 10, symbol: 'TESTSYM_DEC', source_api: 'test', interval: '1d'
    }));
    mockContext.historicalData = decreasingPriceData;
    mockContext.currentIndex = decreasingPriceData.length - 1;
    mockContext.symbol = 'TESTSYM_DEC';
    mockContext.parameters.evaluationLookbackPeriod = 20;
    ((mockContext.portfolio as MockPortfolio).getPosition as jest.Mock).mockReturnValue({ quantity: 0, averagePrice: 0 });


    const buyStratExecute = jest.fn().mockImplementation(async (ctx: StrategyContext<any>) => {
      const portfolio = ctx.portfolio as MockPortfolio;
      const position = portfolio.getPosition();
      if (position?.quantity === 0) return { action: 'BUY' } as StrategySignal;
      return { action: 'HOLD' } as StrategySignal;
    });
    const buyEarlyStrat = createDummyStrategy('buyEarly', 'Buy Early', buyStratExecute);

    const holdStratExecute = jest.fn().mockResolvedValue({ action: 'HOLD' } as StrategySignal);
    const alwaysHoldStrat = createDummyStrategy('alwaysHoldAgain', 'Always Hold Again', holdStratExecute);
    
    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([buyEarlyStrat, alwaysHoldStrat]);
    (StrategyManagerModule.getStrategy as jest.Mock).mockImplementation(id => {
        if (id === 'buyEarly') return buyEarlyStrat;
        if (id === 'alwaysHoldAgain') return alwaysHoldStrat;
        return undefined;
    });

    await aiSelectorStrategy.execute(mockContext);

    const choices = getAISelectorActiveState('TESTSYM_DEC');
    expect(choices.chosenStrategyId).toBe('alwaysHoldAgain'); 
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy alwaysHoldAgain"));
    expect(alwaysHoldStrat.execute).toHaveBeenCalledWith(mockContext); 
    expect(buyEarlyStrat.execute).not.toHaveBeenCalledWith(mockContext);
  });
});

describe('AISelectorStrategy - Specific Candidate IDs', () => {
  let mockContext: StrategyContext<any>;
  let stratA_execute: jest.Mock;
  let stratB_execute: jest.Mock;
  let stratC_execute: jest.Mock;
  let dummyStratA: TradingStrategy;
  let dummyStratB: TradingStrategy;
  let dummyStratC: TradingStrategy;

  beforeEach(() => {
    jest.clearAllMocks();

    stratA_execute = jest.fn().mockResolvedValue({ action: 'BUY' } as StrategySignal);
    stratB_execute = jest.fn().mockResolvedValue({ action: 'HOLD' } as StrategySignal);
    stratC_execute = jest.fn().mockResolvedValue({ action: 'SELL' } as StrategySignal);

    dummyStratA = createDummyStrategy('stratA', 'Strategy A', stratA_execute);
    dummyStratB = createDummyStrategy('stratB', 'Strategy B', stratB_execute);
    dummyStratC = createDummyStrategy('stratC', 'Strategy C', stratC_execute);

    const historicalData: HistoricalDataPoint[] = Array.from({ length: 30 }, (_, i) => ({
        timestamp: Math.floor((Date.now() - (30 - i) * 24 * 60 * 60 * 1000)/1000), date: new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000),
        open: 100 + i, high: 110 + i, low: 90 + i, close: 105 + i, volume: 1000, symbol: 'TESTSYM_CANDIDATE', source_api: 'test', interval: '1d'
    }));
    const mockPortfolioInstance: MockPortfolio = {
        cash: 10000, shares: 0, initialValue: 10000, currentValue: 10000,
        getPosition: jest.fn().mockReturnValue({ quantity: 0, averagePrice: 0 }),
        getCash: () => mockPortfolioInstance.cash, getTrades: () => [], recordTrade: jest.fn(), getMarketValue: () => mockPortfolioInstance.currentValue, getHistoricalPnl: () => [],
    };
    mockContext = {
        symbol: 'TESTSYM_CANDIDATE', historicalData, currentIndex: 29,
        parameters: { evaluationLookbackPeriod: 20, candidateStrategyIds: 'stratB,stratC' },
        portfolio: mockPortfolioInstance as any, signalHistory: [], tradeHistory: [],
    };

    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratA, dummyStratB, dummyStratC]);
    (StrategyManagerModule.getStrategy as jest.Mock).mockImplementation(id => {
        if (id === 'stratA') return dummyStratA;
        if (id === 'stratB') return dummyStratB;
        if (id === 'stratC') return dummyStratC;
        return undefined;
    });
  });

  test('Only specified candidate strategies are evaluated', async () => {
    mockContext.parameters.evaluationMetric = 'pnl';
    
    await aiSelectorStrategy.execute(mockContext);

    expect(stratA_execute).not.toHaveBeenCalled(); 

    const stratB_simulation_calls = stratB_execute.mock.calls.filter(call => call[0].historicalData.length === mockContext.parameters.evaluationLookbackPeriod);
    const stratC_simulation_calls = stratC_execute.mock.calls.filter(call => call[0].historicalData.length === mockContext.parameters.evaluationLookbackPeriod);
    
    expect(stratB_simulation_calls.length).toBeGreaterThan(0);
    expect(stratC_simulation_calls.length).toBeGreaterThan(0);

    const choices = getAISelectorActiveState('TESTSYM_CANDIDATE');
    expect(choices.chosenStrategyId).toBe('stratB'); 
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy stratB"));
    
    expect(stratB_execute).toHaveBeenCalledWith(mockContext); 
    expect(stratC_execute).not.toHaveBeenCalledWith(mockContext);
  });
});

describe('AISelectorStrategy - Metric-Specific Selection', () => {
  let mockContext: StrategyContext<any>;
  const lookback = 10; 

  const metricTestData: HistoricalDataPoint[] = Array.from({ length: lookback + 5 }, (_, i) => ({
    timestamp: Math.floor((Date.now() - (lookback + 5 - i) * 24 * 60 * 60 * 1000)/1000), date: new Date(Date.now() - (lookback + 5 - i) * 24 * 60 * 60 * 1000),
    open: 100 + i * 2, high: 105 + i * 2, low: 95 + i * 2, 
    close: [100,101,102,103,104,103,102,104,105,106,107,108,109,110,111][i] || 100 + i,
    volume: 1000, symbol: 'METRIC_TEST', source_api: 'test', interval: '1d'
  }));

  beforeEach(() => {
    jest.clearAllMocks();
     const mockPortfolioInstance: MockPortfolio = {
        cash: 10000, shares: 0, initialValue: 10000, currentValue: 10000,
        getPosition: jest.fn().mockReturnValue({ quantity: 0, averagePrice: 0 }),
        getCash: () => mockPortfolioInstance.cash, getTrades: () => [], recordTrade: jest.fn(), getMarketValue: () => mockPortfolioInstance.currentValue, getHistoricalPnl: () => [],
    };
    mockContext = {
      symbol: 'METRIC_TEST', historicalData: metricTestData, currentIndex: metricTestData.length -1,
      parameters: { evaluationLookbackPeriod: lookback, candidateStrategyIds: '', evaluationMetric: 'pnl' },
      portfolio: mockPortfolioInstance as any, signalHistory: [], tradeHistory: [],
    };
  });

  test("Selection by 'winRate'", async () => {
    mockContext.parameters.evaluationMetric = 'winRate';
    const stratWin_execute = jest.fn()
      .mockResolvedValueOnce({ action: 'BUY' } as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' } as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' } as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' } as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' } as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' } as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' } as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' } as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' } as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' } as StrategySignal)
      .mockResolvedValue({ action: 'HOLD' } as StrategySignal); 
    const stratPnl_execute = jest.fn()
      .mockResolvedValueOnce({ action: 'BUY' } as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' } as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' } as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' } as StrategySignal)
      .mockResolvedValue({ action: 'HOLD' } as StrategySignal);  

    const dummyStratWin = createDummyStrategy('stratWin', 'High WinRate Strat', stratWin_execute);
    const dummyStratPnl = createDummyStrategy('stratPnl', 'High P&L Strat', stratPnl_execute);

    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratWin, dummyStratPnl]);
    (StrategyManagerModule.getStrategy as jest.Mock).mockImplementation(id => id === 'stratWin' ? dummyStratWin : (id === 'stratPnl' ? dummyStratPnl : undefined));
    
    await aiSelectorStrategy.execute(mockContext);
    
    const choices = getAISelectorActiveState('METRIC_TEST');
    expect(choices.chosenStrategyId).toBe('stratWin');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy stratWin using metric 'winRate' with score 0.8000"));
    expect(dummyStratWin.execute).toHaveBeenCalledWith(mockContext);

    const decision = (aiSelectorStrategy as any).lastAIDecision as AIDecision | null;
    expect(decision).not.toBeNull();
    expect(decision!.chosenStrategyId).toBe('stratWin');
    expect(decision!.evaluationScore).toBeCloseTo(0.8);
  });


  test("Selection by 'sharpe'", async () => {
    mockContext.parameters.evaluationMetric = 'sharpe';
    const stratSharpe_execute = jest.fn()
      .mockResolvedValueOnce({ action: 'BUY' } as StrategySignal) .mockResolvedValueOnce({ action: 'HOLD' } as StrategySignal)
      .mockResolvedValueOnce({ action: 'HOLD' } as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' } as StrategySignal)
      .mockResolvedValue({ action: 'HOLD' } as StrategySignal);   
    const stratVolatile_execute = jest.fn()
      .mockReset() 
      .mockResolvedValueOnce({ action: 'BUY' } as StrategySignal) .mockResolvedValueOnce({ action: 'HOLD' } as StrategySignal)
      .mockResolvedValueOnce({ action: 'HOLD' } as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' } as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' } as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' } as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' } as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' } as StrategySignal)
      .mockResolvedValue({ action: 'HOLD' } as StrategySignal);  

    const dummyStratSharpe = createDummyStrategy('stratSharpe', 'High Sharpe Strat', stratSharpe_execute);
    const dummyStratVolatile = createDummyStrategy('stratVolatile', 'Volatile P&L Strat', stratVolatile_execute);

    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratSharpe, dummyStratVolatile]);
    (StrategyManagerModule.getStrategy as jest.Mock).mockImplementation(id => id === 'stratSharpe' ? dummyStratSharpe : (id === 'stratVolatile' ? dummyStratVolatile : undefined));
    
    await aiSelectorStrategy.execute(mockContext);
    
    const choices = getAISelectorActiveState('METRIC_TEST');
    expect(choices.chosenStrategyId).toBe('stratSharpe');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy stratSharpe using metric 'sharpe'"));
    expect(dummyStratSharpe.execute).toHaveBeenCalledWith(mockContext);

    const decision = (aiSelectorStrategy as any).lastAIDecision as AIDecision | null;
    expect(decision).not.toBeNull();
    expect(decision!.chosenStrategyId).toBe('stratSharpe');
    expect(typeof decision!.evaluationScore).toBe('number');
    if (decision!.evaluationScore !== null) expect(decision!.evaluationScore).toBeGreaterThan(1);
  });

  test("Default to 'pnl' if evaluationMetric is invalid", async () => {
    mockContext.parameters.evaluationMetric = 'invalidMetricName';
    const stratPnl_execute = jest.fn().mockReset()
        .mockResolvedValueOnce({ action: 'BUY' }as StrategySignal) .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal)
        .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal) .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal)
        .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal) .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal)
        .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal) .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal)
        .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' }as StrategySignal)
        .mockResolvedValue({ action: 'HOLD' }as StrategySignal);
    const stratWin_execute = jest.fn()
      .mockResolvedValueOnce({ action: 'BUY' }as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' }as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' }as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' }as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' }as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' }as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' }as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' }as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' }as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' }as StrategySignal)
      .mockResolvedValue({ action: 'HOLD' }as StrategySignal);

    const dummyStratPnl = createDummyStrategy('stratPnlForDefault', 'High PNL for Default', stratPnl_execute);
    const dummyStratWin = createDummyStrategy('stratWinForDefault', 'High WinRate for Default', stratWin_execute);
    
    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratPnl, dummyStratWin]);
    (StrategyManagerModule.getStrategy as jest.Mock).mockImplementation(id => id === 'stratPnlForDefault' ? dummyStratPnl : (id === 'stratWinForDefault' ? dummyStratWin : undefined));

    await aiSelectorStrategy.execute(mockContext);
    const choices = getAISelectorActiveState('METRIC_TEST');
    expect(choices.chosenStrategyId).toBe('stratPnlForDefault');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy stratPnlForDefault using metric 'pnl' with score 6.0000"));
    expect(dummyStratPnl.execute).toHaveBeenCalledWith(mockContext);

    const decision = (aiSelectorStrategy as any).lastAIDecision as AIDecision | null;
    expect(decision).not.toBeNull();
    expect(decision!.chosenStrategyId).toBe('stratPnlForDefault');
    expect(decision!.evaluationMetricUsed).toBe('pnl'); 
    expect(decision!.evaluationScore).toBeCloseTo(6.0);
  });

   test("Default to 'pnl' if evaluationMetric is missing", async () => {
    delete mockContext.parameters.evaluationMetric; 
    const stratPnl_execute = jest.fn()
        .mockResolvedValueOnce({ action: 'BUY' }as StrategySignal) .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal)
        .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal) .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal)
        .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal) .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal)
        .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal) .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal)
        .mockResolvedValueOnce({ action: 'HOLD' }as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' }as StrategySignal)
        .mockResolvedValue({ action: 'HOLD' }as StrategySignal);
    const stratWin_execute = jest.fn()
      .mockResolvedValueOnce({ action: 'BUY' }as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' }as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' }as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' }as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' }as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' }as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' }as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' }as StrategySignal)
      .mockResolvedValueOnce({ action: 'BUY' }as StrategySignal) .mockResolvedValueOnce({ action: 'SELL' }as StrategySignal)
      .mockResolvedValue({ action: 'HOLD' }as StrategySignal);

    const dummyStratPnl = createDummyStrategy('stratPnlForMissing', 'High PNL for Missing', stratPnl_execute);
    const dummyStratWin = createDummyStrategy('stratWinForMissing', 'High WinRate for Missing', stratWin_execute);
    
    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratPnl, dummyStratWin]);
    (StrategyManagerModule.getStrategy as jest.Mock).mockImplementation(id => id === 'stratPnlForMissing' ? dummyStratPnl : (id === 'stratWinForMissing' ? dummyStratWin : undefined));

    await aiSelectorStrategy.execute(mockContext);
    const choices = getAISelectorActiveState('METRIC_TEST');
    expect(choices.chosenStrategyId).toBe('stratPnlForMissing');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy stratPnlForMissing using metric 'pnl' with score 6.0000"));
    expect(dummyStratPnl.execute).toHaveBeenCalledWith(mockContext);

    const decision = (aiSelectorStrategy as any).lastAIDecision as AIDecision | null;
    expect(decision).not.toBeNull();
    expect(decision!.chosenStrategyId).toBe('stratPnlForMissing');
    expect(decision!.evaluationMetricUsed).toBe('pnl');
    expect(decision!.evaluationScore).toBeCloseTo(6.0);
  });

  test("lastAIDecision is populated correctly when no suitable strategy found", async () => {
    mockContext.parameters.evaluationMetric = 'pnl';
    const stratBad_execute = jest.fn().mockImplementation(async (ctx: StrategyContext<any>) => {
        return { action: 'SELL' } as StrategySignal; 
    });
    const dummyStratBad = createDummyStrategy('stratBad', 'Bad Strategy', stratBad_execute);
    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratBad]);
    (StrategyManagerModule.getStrategy as jest.Mock).mockReturnValue(dummyStratBad); 

    await aiSelectorStrategy.execute(mockContext);
    
    const decision = (aiSelectorStrategy as any).lastAIDecision as AIDecision | null;
    expect(decision).not.toBeNull();
    expect(decision!.chosenStrategyId).toBeNull();
    expect(decision!.chosenStrategyName).toBeNull();
    expect(decision!.parametersUsed).toBeNull();
    expect(decision!.evaluationScore).toBeNull(); 
    expect(decision!.evaluationMetricUsed).toBe('pnl');
    expect(decision!.timestamp).toBe(mockContext.historicalData[mockContext.currentIndex].timestamp);
  });

  test("lastAIDecision is reset and updated on subsequent calls", async () => {
    mockContext.parameters.evaluationMetric = 'pnl';
    const stratGood_execute = jest.fn().mockImplementation(async (ctx: StrategyContext<any>) => {
        if(ctx.currentIndex < 2) return { action: 'BUY' } as StrategySignal; 
        return { action: 'HOLD' } as StrategySignal;
    });
    const dummyStratGood = createDummyStrategy('stratGood', 'Good Strategy', stratGood_execute);
    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratGood]);
    (StrategyManagerModule.getStrategy as jest.Mock).mockReturnValue(dummyStratGood);
    
    await aiSelectorStrategy.execute(mockContext);
    const decision1 = JSON.parse(JSON.stringify((aiSelectorStrategy as any).lastAIDecision)); // Deep copy
    expect(decision1.chosenStrategyId).toBe('stratGood');

    const stratBetter_execute = jest.fn().mockImplementation(async (ctx: StrategyContext<any>) => {
        if(ctx.currentIndex < 3) return { action: 'BUY' } as StrategySignal; 
        return { action: 'HOLD' } as StrategySignal; 
    });
    const dummyStratBetter = createDummyStrategy('stratBetter', 'Better Strategy', stratBetter_execute);
    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratBetter, dummyStratGood]); // Add dummyStratGood too for variety
    (StrategyManagerModule.getStrategy as jest.Mock).mockImplementation(id => id === 'stratBetter' ? dummyStratBetter : (id === 'stratGood' ? dummyStratGood : undefined) );
    
    // Simulate a slightly different context or ensure different strategy wins
    // For simplicity, we'll assume stratBetter will score higher if both are candidates
    // Or ensure only stratBetter is available for the second run if that's easier
    (StrategyManagerModule.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratBetter]);
    (StrategyManagerModule.getStrategy as jest.Mock).mockReturnValue(dummyStratBetter);


    await aiSelectorStrategy.execute(mockContext);
    const decision2 = (aiSelectorStrategy as any).lastAIDecision as AIDecision | null;

    expect(decision2).not.toBeNull();
    expect(decision2!.chosenStrategyId).toBe('stratBetter');
    expect(decision1.chosenStrategyId).not.toBe(decision2!.chosenStrategyId); 
  });
});
