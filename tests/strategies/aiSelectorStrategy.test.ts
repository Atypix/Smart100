import { aiSelectorStrategy, getAISelectorChoices } from '../../src/strategies/implementations/aiSelectorStrategy';
import { StrategyManager } from '../../src/strategies/strategyManager';
import { TradingStrategy, StrategyContext, StrategySignal, StrategyParameterDefinition } from '../../src/strategies/strategy.types';
import { logger } from '../../src/utils/logger';
import { HistoricalData } from '../../src/data/historicalData.types';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    silly: jest.fn(),
  },
}));

// Mock StrategyManager
jest.mock('../../src/strategies/strategyManager', () => ({
  StrategyManager: {
    getAvailableStrategies: jest.fn(),
    getStrategy: jest.fn(),
  },
}));

// Helper to create dummy strategies
const createDummyStrategy = (id: string, name: string, executeMock = jest.fn().mockResolvedValue(StrategySignal.HOLD)): TradingStrategy => ({
  id,
  name,
  description: `Dummy strategy ${name}`,
  parameters: {
    param1: { type: 'number', defaultValue: 10, label: 'Param 1', description: 'desc' } as StrategyParameterDefinition,
  },
  execute: executeMock,
});

describe('AISelectorStrategy Execution', () => {
  let mockContext: StrategyContext<any>;
  let stratA_execute: jest.Mock;
  let stratB_execute: jest.Mock;
  let stratC_execute: jest.Mock; // For P&L test
  let dummyStratA: TradingStrategy;
  let dummyStratB: TradingStrategy;
  let dummyStratC_BuyAndWin: TradingStrategy;
  let dummyStratD_SellAndWin: TradingStrategy;


  const sampleHistoricalData: HistoricalData[] = Array.from({ length: 50 }, (_, i) => ({
    timestamp: Date.now() - (50 - i) * 24 * 60 * 60 * 1000,
    open: 100 + i,
    high: 110 + i,
    low: 90 + i,
    close: 105 + i, // Price generally increasing
    volume: 1000 + i * 10,
    symbol: 'TESTSYM',
  }));

  beforeEach(() => {
    jest.clearAllMocks(); // Clear all mocks before each test

    // Clear the choices map before each test
    getAISelectorChoices().clear();

    stratA_execute = jest.fn().mockResolvedValue(StrategySignal.HOLD);
    stratB_execute = jest.fn().mockResolvedValue(StrategySignal.HOLD);
    stratC_execute = jest.fn().mockResolvedValue(StrategySignal.HOLD);


    dummyStratA = createDummyStrategy('stratA', 'Strategy A', stratA_execute);
    dummyStratB = createDummyStrategy('stratB', 'Strategy B', stratB_execute);
    
    // For P&L simulation tests
    dummyStratC_BuyAndWin = createDummyStrategy('stratC_BuyAndWin', 'Strategy C Buy and Win', 
      jest.fn().mockImplementation(async (ctx: StrategyContext<any>) => {
        // Simple logic: Buy on first opportunity, then hold.
        // Assumes the simulation context gives it a chance to buy then P&L is calculated.
        if (ctx.portfolio.getPosition()?.quantity === 0) return StrategySignal.BUY;
        return StrategySignal.HOLD;
      })
    );

    dummyStratD_SellAndWin = createDummyStrategy('stratD_SellAndWin', 'Strategy D Sell and Win',
      jest.fn().mockImplementation(async (ctx: StrategyContext<any>) => {
        // Simple logic: Sell on first opportunity (if holding from a conceptual previous buy for P&L calc), then hold.
        // For this test, we'd need it to enter a short, but our P&L is long only.
        // So let's make it buy, but it will lose money as price goes down.
        // Better: assume it's already in a position and should sell.
        // For simplicity of P&L test, this strategy will just generate SELL signals
        // and we'll craft data so that selling is profitable (or less lossy than buying).
        if (ctx.portfolio.getPosition()?.quantity !== 0) return StrategySignal.SELL; // If in position, sell
        return StrategySignal.HOLD; // Otherwise hold (or buy if we want to test losing scenario)
      })
    );


    mockContext = {
      symbol: 'TESTSYM',
      historicalData: sampleHistoricalData,
      currentIndex: 49, // Current bar is the last one in the sample data
      parameters: {
        evaluationLookbackPeriod: 30,
        candidateStrategyIds: '', // All strategies are candidates
        evaluationMetric: 'pnl', // Explicitly set for these P&L focused tests
      },
      portfolio: {} as any, // Mock as needed for main execution, not simulation part
      trades: [],
      currentSignal: StrategySignal.HOLD,
      signalHistory: [],
    };
    
    (StrategyManager.getStrategy as jest.Mock).mockImplementation(id => {
        if (id === 'stratA') return dummyStratA;
        if (id === 'stratB') return dummyStratB;
        if (id === 'stratC_BuyAndWin') return dummyStratC_BuyAndWin;
        if (id === 'stratD_SellAndWin') return dummyStratD_SellAndWin;
        return undefined;
    });
  });

  test('Test Case 1: Basic Selection - StratA wins P&L', async () => {
    // StratA: Buy then Hold. StratB: Hold. Price is generally increasing.
    // StratA should have positive P&L, StratB should have 0.
    stratA_execute.mockImplementation(async (ctx: StrategyContext<any>) => {
      // Buy on the first call (index 0 of evaluationData), then hold.
      if (ctx.currentIndex === 0 && ctx.portfolio.getPosition()?.quantity === 0) return StrategySignal.BUY;
      return StrategySignal.HOLD;
    });
    stratB_execute.mockResolvedValue(StrategySignal.HOLD); // StratB always holds

    (StrategyManager.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratA, dummyStratB]);
    
    const resultSignal = await aiSelectorStrategy.execute(mockContext);

    // Assert StratA was chosen and its *actual* execute (not simulation one) was called via the main context
    // The P&L simulation will run stratA_execute with simulation contexts.
    // After stratA is chosen, aiSelectorStrategy.execute calls stratA.execute(mockContext - the original one).
    // So, we need to check if stratA_execute was called with the *original* context.
    expect(stratA_execute).toHaveBeenCalledWith(mockContext); 
    expect(stratB_execute).not.toHaveBeenCalledWith(mockContext); // StratB's main execute should not be called

    expect(resultSignal).toBe(StrategySignal.BUY); // Since stratA's last call on original context would be BUY (index 0)
    
    const choices = getAISelectorChoices();
    expect(choices.get('TESTSYM')).toBe('stratA');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy stratA"));
  });

  test('Test Case 2: No Candidate Strategies', async () => {
    (StrategyManager.getAvailableStrategies as jest.Mock).mockReturnValue([]); // No strategies
    
    const resultSignal = await aiSelectorStrategy.execute(mockContext);
    
    expect(resultSignal).toBe(StrategySignal.HOLD);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No candidate strategies found'));
    const choices = getAISelectorChoices();
    expect(choices.has('TESTSYM')).toBe(false);
  });

   test('Test Case 2b: No Candidate Strategies (only self)', async () => {
    (StrategyManager.getAvailableStrategies as jest.Mock).mockReturnValue([aiSelectorStrategy]);
    
    const resultSignal = await aiSelectorStrategy.execute(mockContext);
    
    expect(resultSignal).toBe(StrategySignal.HOLD);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No candidate strategies found'));
    const choices = getAISelectorChoices();
    expect(choices.has('TESTSYM')).toBe(false);
  });

  test('Test Case 3: Insufficient Data for Evaluation', async () => {
    mockContext.parameters.evaluationLookbackPeriod = 60; // Larger than available data (50 points)
    mockContext.currentIndex = 49; 
    // Historical data length is 50. currentIndex = 49.
    // Evaluation data start index = Math.max(0, 49 - 60) = 0. End index = 49. Length = 50.
    // This should be fine. Let's make evaluationData slice smaller.
    // Slice: context.historicalData.slice(Math.max(0, context.currentIndex - evaluationLookbackPeriod), context.currentIndex)
    // If currentIndex < evaluationLookbackPeriod, then it's insufficient.
    
    mockContext.currentIndex = 20; // Current index is less than lookback period
    mockContext.parameters.evaluationLookbackPeriod = 30;

    (StrategyManager.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratA, dummyStratB]);
    
    const resultSignal = await aiSelectorStrategy.execute(mockContext);
    
    expect(resultSignal).toBe(StrategySignal.HOLD);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Not enough historical data for evaluation'));
  });
  
  test('Test Case 3b: Insufficient Evaluation Data Length after slice', async () => {
    mockContext.parameters.evaluationLookbackPeriod = 30;
    mockContext.currentIndex = 10; // This will make evaluationData slice very small
                                  // e.g. slice(0, 10) -> length 10, which is < 30
    mockContext.historicalData = sampleHistoricalData.slice(0,15); // Ensure historical data is also small for this test
    mockContext.currentIndex = 14; // last index of the 15 items
    mockContext.parameters.evaluationLookbackPeriod = 20; // lookback is 20, data length is 15.
                                                        // eval data length will be 15.

    (StrategyManager.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratA, dummyStratB]);
    
    // This test condition is actually for:
    // if (evaluationData.length < evaluationLookbackPeriod)
    // evaluationData = context.historicalData.slice(Math.max(0, context.currentIndex - evaluationLookbackPeriod), context.currentIndex)
    // CurrentIndex = 14. EvalLookback = 20. Total HistData = 15.
    // Slice start = Math.max(0, 14 - 20) = 0. End = 14.
    // evaluationData = sampleHistoricalData.slice(0,14) -> length 14.
    // This is less than evaluationLookbackPeriod (20).
    
    const resultSignal = await aiSelectorStrategy.execute(mockContext);
    
    expect(resultSignal).toBe(StrategySignal.HOLD);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Insufficient evaluation data length'));
  });


  test('Test Case 4: Candidate Strategies use Default Parameters', async () => {
    const mockParamStrategyExecute = jest.fn().mockResolvedValue(StrategySignal.BUY);
    const paramStrategy = {
      ...createDummyStrategy('paramStrat', 'Param Strat', mockParamStrategyExecute),
      parameters: {
        importantParam: { type: 'number', defaultValue: 123, label: 'Imp Param', description: 'desc' } as StrategyParameterDefinition,
      }
    };
    (StrategyManager.getAvailableStrategies as jest.Mock).mockReturnValue([paramStrategy]);
    (StrategyManager.getStrategy as jest.Mock).mockReturnValue(paramStrategy); // Ensure getStrategy returns it for final execution

    await aiSelectorStrategy.execute(mockContext);

    // Check that the *simulation* call to paramStrategy.execute had the default parameters
    // The execute function is called multiple times: once per bar in the simulation loop.
    // We need to check the context passed during one of those simulation calls.
    const simulationCalls = mockParamStrategyExecute.mock.calls.filter(call => {
      const ctx = call[0] as StrategyContext<any>;
      // Distinguish simulation context from final execution context
      // Simulation context will have historicalData that is a slice (evaluationData)
      return ctx.historicalData.length === mockContext.parameters.evaluationLookbackPeriod;
    });
    
    expect(simulationCalls.length).toBeGreaterThan(0);
    expect(simulationCalls[0][0].parameters.importantParam).toBe(123); // Default value

    // Also ensure the main execution (if this strategy was chosen) uses the original context's params
    // (which for ai-selector itself, are evaluationLookbackPeriod etc.)
    // For this test, paramStrategy will be chosen as it's the only one and will generate BUY.
    // The final call to paramStrategy.execute will use the *original* context.
    const finalCall = mockParamStrategyExecute.mock.calls.find(call => {
        const ctx = call[0] as StrategyContext<any>;
        return ctx.historicalData === mockContext.historicalData; // Original context
    });
    expect(finalCall).toBeDefined();
    // The parameters for the *final* execution of the chosen strategy should be the AI Selector's params.
    // This is because `finalSelectedStrategy.execute(context)` is called.
    expect(finalCall[0].parameters.importantParam).toBeUndefined(); // It will have AI Selector's params
    expect(finalCall[0].parameters.evaluationLookbackPeriod).toBe(mockContext.parameters.evaluationLookbackPeriod);


  });

  test('Test Case 5: P&L Simulation Logic - BuyAndWin vs Hold', async () => {
    // dummyStratC_BuyAndWin always buys then holds. Prices are generally increasing.
    // dummyStratA (default mock) always holds.
    // So C should win.
    const holdExecute = jest.fn().mockResolvedValue(StrategySignal.HOLD);
    const alwaysHoldStrat = createDummyStrategy('alwaysHold', 'Always Hold', holdExecute);

    (StrategyManager.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratC_BuyAndWin, alwaysHoldStrat]);
    (StrategyManager.getStrategy as jest.Mock).mockImplementation(id => {
        if (id === 'stratC_BuyAndWin') return dummyStratC_BuyAndWin;
        if (id === 'alwaysHold') return alwaysHoldStrat;
        return undefined;
    });
    
    await aiSelectorStrategy.execute(mockContext);
    
    const choices = getAISelectorChoices();
    expect(choices.get('TESTSYM')).toBe('stratC_BuyAndWin');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy stratC_BuyAndWin"));
    // Check that dummyStratC_BuyAndWin.execute was called with the main context after selection
    expect(dummyStratC_BuyAndWin.execute).toHaveBeenCalledWith(mockContext);
    expect(holdExecute).not.toHaveBeenCalledWith(mockContext);
  });

  test('Test Case 5b: P&L Simulation - SellAndWin vs BuyAndLose (prices decreasing)', async () => {
    const decreasingPriceData: HistoricalData[] = Array.from({ length: 30 }, (_, i) => ({
        timestamp: Date.now() - (30 - i) * 24 * 60 * 60 * 1000,
        open: 100 - i,
        high: 110 - i,
        low: 90 - i,
        close: 95 - i, // Price generally decreasing
        volume: 1000 + i * 10,
        symbol: 'TESTSYM_DEC',
    }));
    mockContext.historicalData = decreasingPriceData;
    mockContext.currentIndex = decreasingPriceData.length - 1;
    mockContext.symbol = 'TESTSYM_DEC';
    mockContext.parameters.evaluationLookbackPeriod = 20;


    // Strat D: Sells if in position. For simulation, it will be put into a position first.
    // Let's refine this. Strat D always tries to SELL. Strat C always tries to BUY.
    // If price is decreasing, selling the entry from a BUY is a loss.
    // The P&L simulation: if BUY, entryPrice = currentBar.close. If SELL, currentPnl += (currentBar.close - entryPrice).
    // A strategy that BUYS will have PnL = (exitPrice - entryPrice). If prices decrease, this is negative.
    // A strategy that does nothing has PnL = 0.
    // So, a HOLD strategy should win over a BUY strategy if prices are falling.

    const buyStratExecute = jest.fn().mockImplementation(async (ctx: StrategyContext<any>) => {
      // Always try to buy if not in position
      if (ctx.portfolio.getPosition()?.quantity === 0) return StrategySignal.BUY;
      return StrategySignal.HOLD;
    });
    const buyEarlyStrat = createDummyStrategy('buyEarly', 'Buy Early', buyStratExecute);

    const holdStratExecute = jest.fn().mockResolvedValue(StrategySignal.HOLD);
    const alwaysHoldStrat = createDummyStrategy('alwaysHoldAgain', 'Always Hold Again', holdStratExecute);
    
    (StrategyManager.getAvailableStrategies as jest.Mock).mockReturnValue([buyEarlyStrat, alwaysHoldStrat]);
    (StrategyManager.getStrategy as jest.Mock).mockImplementation(id => {
        if (id === 'buyEarly') return buyEarlyStrat;
        if (id === 'alwaysHoldAgain') return alwaysHoldStrat;
        return undefined;
    });

    await aiSelectorStrategy.execute(mockContext);

    const choices = getAISelectorChoices();
    expect(choices.get('TESTSYM_DEC')).toBe('alwaysHoldAgain'); // HOLD should win if prices fall and another strategy BUYS
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy alwaysHoldAgain"));
    expect(alwaysHoldStrat.execute).toHaveBeenCalledWith(mockContext); // Main context
    expect(buyEarlyStrat.execute).not.toHaveBeenCalledWith(mockContext); // Main context
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
    getAISelectorChoices().clear();

    stratA_execute = jest.fn().mockResolvedValue(StrategySignal.BUY); // StratA always buys
    stratB_execute = jest.fn().mockResolvedValue(StrategySignal.HOLD); // StratB always holds
    stratC_execute = jest.fn().mockResolvedValue(StrategySignal.SELL); // StratC always sells

    dummyStratA = createDummyStrategy('stratA', 'Strategy A', stratA_execute);
    dummyStratB = createDummyStrategy('stratB', 'Strategy B', stratB_execute);
    dummyStratC = createDummyStrategy('stratC', 'Strategy C', stratC_execute);

    // Price increasing data
    const historicalData: HistoricalData[] = Array.from({ length: 30 }, (_, i) => ({
        timestamp: Date.now() - (30 - i) * 24 * 60 * 60 * 1000,
        open: 100 + i, high: 110 + i, low: 90 + i, close: 105 + i, volume: 1000, symbol: 'TESTSYM_CANDIDATE'
    }));

    mockContext = {
        symbol: 'TESTSYM_CANDIDATE',
        historicalData,
        currentIndex: 29,
        parameters: {
            evaluationLookbackPeriod: 20,
            candidateStrategyIds: 'stratB,stratC', // Only B and C are candidates
        },
        portfolio: {} as any, trades: [], currentSignal: StrategySignal.HOLD, signalHistory: [],
    };

    (StrategyManager.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratA, dummyStratB, dummyStratC]);
    (StrategyManager.getStrategy as jest.Mock).mockImplementation(id => {
        if (id === 'stratA') return dummyStratA;
        if (id === 'stratB') return dummyStratB;
        if (id === 'stratC') return dummyStratC;
        return undefined;
    });
  });

  test('Only specified candidate strategies are evaluated', async () => {
    // StratB (HOLD) and StratC (SELL) are candidates. Prices are increasing.
    // HOLD (P&L 0) should be better than SELL (P&L < 0). StratA (BUY, P&L > 0) is NOT a candidate.
    // So StratB should be chosen.
    mockContext.parameters.evaluationMetric = 'pnl'; // Explicitly P&L for this test too
    
    await aiSelectorStrategy.execute(mockContext);

    // Check that stratA.execute was NOT called during simulation, but B and C were.
    // The number of calls for B & C simulation depends on evaluationLookbackPeriod.
    // StratA's main execute should not be called.
    expect(stratA_execute).not.toHaveBeenCalled(); // StratA should not be considered at all

    // StratB and StratC simulation calls:
    // We check if their execute methods were called with a context that has evaluationData
    const stratB_simulation_calls = stratB_execute.mock.calls.filter(call => call[0].historicalData.length === mockContext.parameters.evaluationLookbackPeriod);
    const stratC_simulation_calls = stratC_execute.mock.calls.filter(call => call[0].historicalData.length === mockContext.parameters.evaluationLookbackPeriod);
    
    expect(stratB_simulation_calls.length).toBeGreaterThan(0);
    expect(stratC_simulation_calls.length).toBeGreaterThan(0);

    // Check final choice and execution
    const choices = getAISelectorChoices();
    expect(choices.get('TESTSYM_CANDIDATE')).toBe('stratB'); // StratB (HOLD) should win
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy stratB"));
    
    // StratB's main execute IS called. StratC's main execute is NOT.
    expect(stratB_execute).toHaveBeenCalledWith(mockContext); 
    expect(stratC_execute).not.toHaveBeenCalledWith(mockContext);
  });
});

describe('AISelectorStrategy - Metric-Specific Selection', () => {
  let mockContext: StrategyContext<any>;
  const lookback = 10; // Shorter lookback for simpler metric test data

  // More dynamic data for varied returns
  const metricTestData: HistoricalData[] = Array.from({ length: lookback + 5 }, (_, i) => ({ // +5 for main context current index
    timestamp: Date.now() - (lookback + 5 - i) * 24 * 60 * 60 * 1000,
    open: 100 + i * 2,
    high: 105 + i * 2,
    low: 95 + i * 2,
    // close prices: 100, 101, 102, 103, 104, 103, 102, 104, 105, 106 -- varied for Sharpe
    close: [100,101,102,103,104,103,102,104,105,106,107,108,109,110,111][i] || 100 + i,
    volume: 1000,
    symbol: 'METRIC_TEST',
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    getAISelectorChoices().clear();

    mockContext = {
      symbol: 'METRIC_TEST',
      historicalData: metricTestData,
      currentIndex: metricTestData.length -1, // current bar is the last one
      parameters: {
        evaluationLookbackPeriod: lookback, // Use the shorter lookback
        candidateStrategyIds: '',
        evaluationMetric: 'pnl', // Default, will be overridden in tests
      },
      portfolio: {} as any, trades: [], currentSignal: StrategySignal.HOLD, signalHistory: [],
    };
  });

  test("Selection by 'winRate'", async () => {
    mockContext.parameters.evaluationMetric = 'winRate';

    // StratWin: High Win Rate (4 wins / 5 trades = 0.8), P&L = 1+1+1+1-4 = 0
    const stratWin_execute = jest.fn()
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 0: Buy at 100
      .mockResolvedValueOnce(StrategySignal.SELL) // Bar 1: Sell at 101 (Win: +1)
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 2: Buy at 102
      .mockResolvedValueOnce(StrategySignal.SELL) // Bar 3: Sell at 103 (Win: +1)
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 4: Buy at 104
      .mockResolvedValueOnce(StrategySignal.SELL) // Bar 5: Sell at 103 (Loss: -1)
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 6: Buy at 102
      .mockResolvedValueOnce(StrategySignal.SELL) // Bar 7: Sell at 104 (Win: +2)
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 8: Buy at 105
      .mockResolvedValueOnce(StrategySignal.SELL) // Bar 9: Sell at 106 (Win: +1)
      .mockResolvedValue(StrategySignal.HOLD); // Subsequent calls

    // StratPnl: Lower Win Rate (1 win / 1 trade = 1.0, but fewer trades), Higher P&L = 6
    // To make it more distinct from StratWin, let's give it 1 win / 2 trades = 0.5
    const stratPnl_execute = jest.fn()
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 0: Buy at 100
      .mockResolvedValueOnce(StrategySignal.SELL) // Bar 1: Sell at 101 (Win: +1)
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 2: Buy at 102
      .mockResolvedValueOnce(StrategySignal.SELL) // Bar 3: Sell at 100 (Loss: -2)
      .mockResolvedValue(StrategySignal.HOLD);   // PNL = -1, WinRate = 0.5 (1/2)

    const dummyStratWin = createDummyStrategy('stratWin', 'High WinRate Strat', stratWin_execute);
    const dummyStratPnl = createDummyStrategy('stratPnl', 'High P&L Strat', stratPnl_execute);

    (StrategyManager.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratWin, dummyStratPnl]);
    (StrategyManager.getStrategy as jest.Mock).mockImplementation(id => {
      if (id === 'stratWin') return dummyStratWin;
      if (id === 'stratPnl') return dummyStratPnl;
      return undefined;
    });
    
    await aiSelectorStrategy.execute(mockContext);
    // Expected for stratWin: 5 trades, 4 profitable. WinRate = 0.8. PNL = 1+1-1+2+1 = 4
    // Expected for stratPnl: 2 trades, 1 profitable. WinRate = 0.5. PNL = 1-2 = -1

    expect(getAISelectorChoices().get('METRIC_TEST')).toBe('stratWin');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy stratWin using metric 'winRate' with score 0.8000"));
    expect(dummyStratWin.execute).toHaveBeenCalledWith(mockContext); // Main context execution
  });


  test("Selection by 'sharpe'", async () => {
    mockContext.parameters.evaluationMetric = 'sharpe';

    // StratSharpe: Lower P&L, but very consistent positive returns (low std dev)
    // Returns: (101-100)/100=0.01, (102-101)/101=0.0099, (103-102)/102=0.0098. Total PNL = 3. Sharp ~ high
    const stratSharpe_execute = jest.fn()
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 0: Buy at 100
      .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 1: Price 101. Return for holding: (101-100)/100 = 0.01
      .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 2: Price 102. Return for holding: (102-101)/101 = 0.0099...
      .mockResolvedValueOnce(StrategySignal.SELL) // Bar 3: Price 103. Return for holding: (103-102)/102 = 0.0098...  Sell for PNL=3
      .mockResolvedValue(StrategySignal.HOLD);    // PNL = 3. Returns for Sharpe: [0.01, 0.0099, 0.0098] (approx)

    // StratVolatile: Higher P&L possible, but volatile returns (high std dev)
    // PNL = 6. Returns for Sharpe: [0.04, -0.0097, 0.019] (approx)
    const stratVolatile_execute = jest.fn()
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 0: Buy at 100
      .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 1: Price 101
      .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 2: Price 102
      .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 3: Price 103
      .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 4: Price 104. Return for holding: (104-100)/100 = 0.04 (if held from start)
                                                 // Let's make it trade more for clearer period returns
                                                 // Buy at 100 (Bar 0), Sell at 104 (Bar 4). PNL = 4. Returns while holding: [0.01,0.0099,0.0098,0.0097]
                                                 // Buy at 103 (Bar 5), Sell at 102 (Bar 6). PNL = -1. Returns while holding: [-0.0097]
                                                 // Buy at 104 (Bar 7), Sell at 106 (Bar 9). PNL = +2. Returns while holding: [0.0096, 0.0095]
                                                 // Total PNL = 4-1+2 = 5
      .mockReset() // Reset any previous calls if this mock is reused
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 0: Buy at 100
      .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 1: Price 101. Ret: 0.01
      .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 2: Price 102. Ret: 0.0099
      .mockResolvedValueOnce(StrategySignal.SELL) // Bar 3: Price 103. Sell. PNL = 3. Ret: 0.0098. Trade 1 (Win)
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 4: Price 104. Buy.
      .mockResolvedValueOnce(StrategySignal.SELL) // Bar 5: Price 103. Sell. PNL = -1. Ret: -0.0096. Trade 2 (Loss)
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 6: Price 102. Buy
      .mockResolvedValueOnce(StrategySignal.SELL) // Bar 7: Price 104. Sell. PNL = +2. Ret: 0.0196. Trade 3 (Win)
      .mockResolvedValue(StrategySignal.HOLD);   // Total PNL = 3-1+2 = 4. Win Rate 2/3 = 0.66
                                                 // StratSharpe PNL = 3. Win Rate 1/1 = 1.0

    const dummyStratSharpe = createDummyStrategy('stratSharpe', 'High Sharpe Strat', stratSharpe_execute);
    const dummyStratVolatile = createDummyStrategy('stratVolatile', 'Volatile P&L Strat', stratVolatile_execute);

    (StrategyManager.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratSharpe, dummyStratVolatile]);
    (StrategyManager.getStrategy as jest.Mock).mockImplementation(id => {
      if (id === 'stratSharpe') return dummyStratSharpe;
      if (id === 'stratVolatile') return dummyStratVolatile;
      return undefined;
    });
    
    await aiSelectorStrategy.execute(mockContext);
    // StratSharpe: PNL=3. Trades=1, Profitable=1. WinRate=1.0. Returns for position: [0.01, 0.00990099, 0.00980392]. AvgRet ~0.0099. StdDev ~0.00009. Sharpe ~ High.
    // StratVolatile: PNL=4. Trades=3, Profitable=2. WinRate=0.66. Returns for positions: [0.01, 0.0099, 0.0098], [-0.0096], [0.0196]. Will have higher std dev.
    
    expect(getAISelectorChoices().get('METRIC_TEST')).toBe('stratSharpe');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy stratSharpe using metric 'sharpe'"));
    expect(dummyStratSharpe.execute).toHaveBeenCalledWith(mockContext);
  });

  test("Default to 'pnl' if evaluationMetric is invalid", async () => {
    mockContext.parameters.evaluationMetric = 'invalidMetricName';

    // StratPnl: PNL = 10
    const stratPnl_execute = jest.fn()
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 0: Buy at 100
      .mockResolvedValueOnce(StrategySignal.SELL); // Bar 1: Sell at 101. PNL = 1. Trade 1 (Win)
      // Let's make PNL higher: buy at 100, sell at 110 (imaginary price for simplicity of PNL focus)
      // For real data: Buy at 100 (Bar 0), Sell at 106 (Bar 9). PNL = 6
    stratPnl_execute.mockReset()
        .mockResolvedValueOnce(StrategySignal.BUY) // Bar 0: Buy at 100
        .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 1: 101
        .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 2: 102
        .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 3: 103
        .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 4: 104
        .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 5: 103
        .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 6: 102
        .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 7: 104
        .mockResolvedValueOnce(StrategySignal.HOLD) // Bar 8: 105
        .mockResolvedValueOnce(StrategySignal.SELL) // Bar 9: Sell at 106. PNL = 6. WinRate = 1/1 = 1.0
        .mockResolvedValue(StrategySignal.HOLD);


    // StratWin: WinRate = 0.8 (4/5), PNL = 4 (as from winRate test)
    const stratWin_execute = jest.fn()
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 0: Buy at 100, Sell at 101 (PNL +1) Win
      .mockResolvedValueOnce(StrategySignal.SELL)
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 2: Buy at 102, Sell at 103 (PNL +1) Win
      .mockResolvedValueOnce(StrategySignal.SELL)
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 4: Buy at 104, Sell at 103 (PNL -1) Loss
      .mockResolvedValueOnce(StrategySignal.SELL)
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 6: Buy at 102, Sell at 104 (PNL +2) Win
      .mockResolvedValueOnce(StrategySignal.SELL)
      .mockResolvedValueOnce(StrategySignal.BUY)  // Bar 8: Buy at 105, Sell at 106 (PNL +1) Win
      .mockResolvedValueOnce(StrategySignal.SELL)
      .mockResolvedValue(StrategySignal.HOLD);

    const dummyStratPnl = createDummyStrategy('stratPnlForDefault', 'High PNL for Default', stratPnl_execute);
    const dummyStratWin = createDummyStrategy('stratWinForDefault', 'High WinRate for Default', stratWin_execute);
    
    (StrategyManager.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratPnl, dummyStratWin]);
    (StrategyManager.getStrategy as jest.Mock).mockImplementation(id => {
      if (id === 'stratPnlForDefault') return dummyStratPnl;
      if (id === 'stratWinForDefault') return dummyStratWin;
      return undefined;
    });

    await aiSelectorStrategy.execute(mockContext);
    // StratPnl: PNL = 6, WinRate = 1.0
    // StratWin: PNL = 4, WinRate = 0.8
    // Defaulting to PNL, stratPnlForDefault should win.
    expect(getAISelectorChoices().get('METRIC_TEST')).toBe('stratPnlForDefault');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy stratPnlForDefault using metric 'pnl' with score 6.0000"));
    expect(dummyStratPnl.execute).toHaveBeenCalledWith(mockContext);
  });

   test("Default to 'pnl' if evaluationMetric is missing", async () => {
    delete mockContext.parameters.evaluationMetric; // Remove the metric parameter

    // Same strategies and expectations as the 'invalidMetricName' test
    const stratPnl_execute = jest.fn()
        .mockResolvedValueOnce(StrategySignal.BUY) 
        .mockResolvedValueOnce(StrategySignal.HOLD) 
        .mockResolvedValueOnce(StrategySignal.HOLD) 
        .mockResolvedValueOnce(StrategySignal.HOLD) 
        .mockResolvedValueOnce(StrategySignal.HOLD) 
        .mockResolvedValueOnce(StrategySignal.HOLD) 
        .mockResolvedValueOnce(StrategySignal.HOLD) 
        .mockResolvedValueOnce(StrategySignal.HOLD) 
        .mockResolvedValueOnce(StrategySignal.HOLD) 
        .mockResolvedValueOnce(StrategySignal.SELL) 
        .mockResolvedValue(StrategySignal.HOLD);


    const stratWin_execute = jest.fn()
      .mockResolvedValueOnce(StrategySignal.BUY)
      .mockResolvedValueOnce(StrategySignal.SELL)
      .mockResolvedValueOnce(StrategySignal.BUY)
      .mockResolvedValueOnce(StrategySignal.SELL)
      .mockResolvedValueOnce(StrategySignal.BUY)
      .mockResolvedValueOnce(StrategySignal.SELL)
      .mockResolvedValueOnce(StrategySignal.BUY)
      .mockResolvedValueOnce(StrategySignal.SELL)
      .mockResolvedValueOnce(StrategySignal.BUY)
      .mockResolvedValueOnce(StrategySignal.SELL)
      .mockResolvedValue(StrategySignal.HOLD);

    const dummyStratPnl = createDummyStrategy('stratPnlForMissing', 'High PNL for Missing', stratPnl_execute);
    const dummyStratWin = createDummyStrategy('stratWinForMissing', 'High WinRate for Missing', stratWin_execute);
    
    (StrategyManager.getAvailableStrategies as jest.Mock).mockReturnValue([dummyStratPnl, dummyStratWin]);
    (StrategyManager.getStrategy as jest.Mock).mockImplementation(id => {
      if (id === 'stratPnlForMissing') return dummyStratPnl;
      if (id === 'stratWinForMissing') return dummyStratWin;
      return undefined;
    });

    await aiSelectorStrategy.execute(mockContext);
    expect(getAISelectorChoices().get('METRIC_TEST')).toBe('stratPnlForMissing');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Chose strategy stratPnlForMissing using metric 'pnl' with score 6.0000"));
    expect(dummyStratPnl.execute).toHaveBeenCalledWith(mockContext);
  });
});
