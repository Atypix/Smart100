import request from 'supertest';
import express, { Express } from 'express';
import mainRouter from '../../src/api/index'; // Assuming this is your main router
import { getAISelectorChoices } from '../../src/strategies/implementations/aiSelectorStrategy';
import { StrategyManager } from '../../src/strategies/strategyManager';
import { TradingStrategy, StrategySignal, StrategyParameterDefinition } from '../../src/strategies/strategy.types'; // For dummy strategy type
import { logger } from '../../src/utils/logger'; // To potentially silence it during tests

// Mock logger to prevent console output during tests
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
jest.mock('../../src/strategies/strategyManager');

// Mock the actual getAISelectorChoices from aiSelectorStrategy
// We are testing the route, so we need to control what this function returns.
// The actual implementation of aiSelectorStrategy is tested in its own unit tests.
jest.mock('../../src/strategies/implementations/aiSelectorStrategy', () => ({
  ...jest.requireActual('../../src/strategies/implementations/aiSelectorStrategy'), // Import and retain default exports
  getAISelectorChoices: jest.fn(),
}));


const app: Express = express();
app.use(express.json());
// Mount the main router which should include /api/ai routes
// If your mainRouter is directly the one with /ai, then app.use('/api', mainRouter) might be needed
// depending on how mainRouter is structured.
// Given current setup: mainRouter -> aiRoutes (mounted at /ai)
// So, if mainRouter is used directly at root, then /ai/...
// If mainRouter is typically mounted at /api, then /api/ai/...
// The backend setup is app.use('/api', mainRouter); so request path will be /api/ai/...
app.use('/api', mainRouter);


describe('GET /api/ai/current-strategy/:symbol', () => {
  const mockChoicesMap = new Map<string, string>();
  
  const dummyStrategy: TradingStrategy = {
    id: 'dummyStrat',
    name: 'Dummy Strategy',
    description: 'A dummy strategy for testing',
    parameters: {},
    execute: jest.fn().mockResolvedValue(StrategySignal.HOLD),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockChoicesMap.clear();
    (getAISelectorChoices as jest.Mock).mockReturnValue(mockChoicesMap);
  });

  test('Test Case 1: Valid Symbol with AI Choice', async () => {
    mockChoicesMap.set('TESTSYM', 'dummyStrat');
    (StrategyManager.getStrategy as jest.Mock).mockReturnValue(dummyStrategy);

    const response = await request(app).get('/api/ai/current-strategy/TESTSYM');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      symbol: 'TESTSYM',
      chosenStrategyId: 'dummyStrat',
      chosenStrategyName: 'Dummy Strategy',
      message: 'AI is currently using Dummy Strategy (ID: dummyStrat) for TESTSYM.',
    });
    expect(getAISelectorChoices).toHaveBeenCalled();
    expect(StrategyManager.getStrategy).toHaveBeenCalledWith('dummyStrat');
  });

  test('Test Case 2: Valid Symbol without AI Choice', async () => {
    // mockChoicesMap is empty by default or after clear
    const response = await request(app).get('/api/ai/current-strategy/TESTSYM_NOCHOICE');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      symbol: 'TESTSYM_NOCHOICE',
      message: 'AI choice not available for symbol TESTSYM_NOCHOICE. AISelectorStrategy may not have been executed for this symbol yet.',
    });
    expect(getAISelectorChoices).toHaveBeenCalled();
    expect(StrategyManager.getStrategy).not.toHaveBeenCalled();
  });
  
  test('Test Case 3: Invalid Strategy ID stored (Internal Error Scenario - strategy not found by manager)', async () => {
    mockChoicesMap.set('TESTSYM_ERR', 'nonExistentStrat');
    (StrategyManager.getStrategy as jest.Mock).mockReturnValue(undefined); // StrategyManager can't find this strategy

    const response = await request(app).get('/api/ai/current-strategy/TESTSYM_ERR');
    
    // The current implementation in aiRoutes.ts returns the ID but "Unknown Strategy" for the name.
    // This is a graceful handling rather than a 500.
    // To get a 500, getAISelectorChoices itself would need to throw, or StrategyManager.getStrategy would.
    // Let's adjust based on current behavior:
    expect(response.status).toBe(200); // It's handled gracefully by setting name to "Unknown Strategy"
    expect(response.body).toEqual({
        symbol: 'TESTSYM_ERR',
        chosenStrategyId: 'nonExistentStrat',
        chosenStrategyName: 'Unknown Strategy', // This is how the route handles it
        message: 'AI is currently using Unknown Strategy (ID: nonExistentStrat) for TESTSYM_ERR.'
    });
    // If we want to test a 500, we'd need getAISelectorChoices to throw an error.
  });

  test('Test Case 3b: Internal Error Scenario - getAISelectorChoices throws error', async () => {
    (getAISelectorChoices as jest.Mock).mockImplementation(() => {
      throw new Error("Failed to retrieve choices map");
    });

    const response = await request(app).get('/api/ai/current-strategy/ANY_SYMBOL');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
        symbol: 'ANY_SYMBOL',
        message: "Internal server error while fetching AI strategy choice."
    });
  });


  test('Test Case 4: Symbol parameter is missing (Express route handling)', async () => {
    // This tests if the route is even matched if symbol is not there.
    // Depending on Express's strict routing, /api/ai/current-strategy/ (trailing slash) might be different.
    // Typically, a missing param like this would result in a 404 from the router if no other route matches.
    // If the route is /:symbol and no symbol is provided, it won't match.
    // Let's try with an empty symbol, which the route logic should catch.
    const response = await request(app).get('/api/ai/current-strategy/'); // Or some path that doesn't match
    
    // This will likely be a 404 because the route `/:symbol` expects a symbol.
    // The `if (!symbol)` check inside the handler is for when the symbol extracted is empty or undefined,
    // but Express itself might not even call the handler if the path structure isn't matched.
    // E.g. /api/ai/current-strategy/ (empty) -> symbol is effectively empty string.
    expect(response.status).toBe(400); // Based on `if (!symbol)` check
    expect(response.body.message).toContain("Symbol parameter is required.");


    // Test with a path that clearly doesn't match due to missing param
     const responseForNonMatchingPath = await request(app).get('/api/ai/current-strategy'); // No segment for :symbol
     expect(responseForNonMatchingPath.status).toBe(404); // Express router should 404 this.
  });
});
