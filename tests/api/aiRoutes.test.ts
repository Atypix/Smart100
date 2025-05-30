import request from 'supertest';
// import express, { Express } from 'express'; // No longer directly using Express here
// import mainRouter from '../../src/api/index'; // mainRouter is used by createApp
import { createApp } from '../../src/index'; // Import createApp
// Import the new helper and its type
import { getAISelectorActiveState, AISelectorChoiceState } from '../../src/strategies/implementations/aiSelectorStrategy';
// Removed StrategyManager import as it's not directly used and caused issues with mocking
// import { StrategyManager } from '../../src/strategies/strategyManager'; 
import { TradingStrategy, StrategySignal, StrategyParameterDefinition } from '../../src/strategies/strategy.types';
// The local import of logger might still be here but the mock is removed.
// The global mock from setupMocks.ts should take precedence.
import logger from '../../src/utils/logger'; 


// Mock StrategyManager - mock individual functions if needed by the tested routes
jest.mock('../../src/strategies/strategyManager', () => ({
  getStrategy: jest.fn(),
  getAvailableStrategies: jest.fn(),
}));

// Mock the getAISelectorActiveState function from aiSelectorStrategy.ts
jest.mock('../../src/strategies/implementations/aiSelectorStrategy', () => {
  const originalModule = jest.requireActual('../../src/strategies/implementations/aiSelectorStrategy');
  return {
    ...originalModule, // Retain other exports like AISelectorStrategyParams, etc.
    getAISelectorActiveState: jest.fn(), // Mock this specific function
  };
});

let app: any; // Declare app variable

describe('GET /api/ai/current-strategy/:symbol', () => {
  // Define a type for our mock to ensure it's used correctly
  let mockGetAISelectorActiveState: jest.MockedFunction<typeof getAISelectorActiveState>;

  beforeAll(() => { // Use beforeAll to create app instance once for the suite
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Assign the mock to the typed variable
    mockGetAISelectorActiveState = getAISelectorActiveState as jest.MockedFunction<typeof getAISelectorActiveState>;
  });

  test('Test Case 1: Valid Symbol with AI Choice (Optimized Parameters)', async () => {
    const mockOptimizedParams = { period: 10, threshold: 55 };
    const mockAiState: AISelectorChoiceState = {
      chosenStrategyId: 'optimizedStrat',
      chosenStrategyName: 'Optimized Strategy',
      parametersUsed: mockOptimizedParams,
      message: 'AI is using Optimized Strategy with specified parameters.' // Optional, can be constructed by API
    };
    mockGetAISelectorActiveState.mockReturnValue(mockAiState);

    const response = await request(app).get('/api/ai/current-strategy/TESTSYM_OPT');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      symbol: 'TESTSYM_OPT',
      chosenStrategyId: 'optimizedStrat',
      chosenStrategyName: 'Optimized Strategy',
      chosenParameters: mockOptimizedParams,
      message: `AI is currently using Optimized Strategy (ID: optimizedStrat) with specified parameters for TESTSYM_OPT.`,
    });
    expect(mockGetAISelectorActiveState).toHaveBeenCalledWith('TESTSYM_OPT');
  });

  test('Test Case 2: Valid Symbol without AI Choice', async () => {
    const mockAiStateNoChoice: AISelectorChoiceState = {
      chosenStrategyId: null,
      chosenStrategyName: null,
      parametersUsed: null,
      message: 'No strategy choice has been made for this symbol yet.',
    };
    mockGetAISelectorActiveState.mockReturnValue(mockAiStateNoChoice);

    const response = await request(app).get('/api/ai/current-strategy/TESTSYM_NOCHOICE');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      symbol: 'TESTSYM_NOCHOICE',
      message: 'No strategy choice has been made for this symbol yet.',
    });
    expect(mockGetAISelectorActiveState).toHaveBeenCalledWith('TESTSYM_NOCHOICE');
  });

  test('Test Case 3: AI Choice with Default Parameters (Optimization Off/Failed)', async () => {
    const mockDefaultParams = { rsiPeriod: 14, rsiOverbought: 70 };
    const mockAiStateDefault: AISelectorChoiceState = {
      chosenStrategyId: 'defaultParamStrat',
      chosenStrategyName: 'Default Param Strategy',
      parametersUsed: mockDefaultParams, // These are the defaults for 'defaultParamStrat'
      message: 'AI is using Default Param Strategy with default parameters.' // Optional
    };
    mockGetAISelectorActiveState.mockReturnValue(mockAiStateDefault);

    const response = await request(app).get('/api/ai/current-strategy/TESTSYM_DEF');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      symbol: 'TESTSYM_DEF',
      chosenStrategyId: 'defaultParamStrat',
      chosenStrategyName: 'Default Param Strategy',
      chosenParameters: mockDefaultParams,
      message: `AI is currently using Default Param Strategy (ID: defaultParamStrat) with specified parameters for TESTSYM_DEF.`,
    });
    expect(mockGetAISelectorActiveState).toHaveBeenCalledWith('TESTSYM_DEF');
  });
  
  test('Test Case 4: Internal Error Scenario - getAISelectorActiveState throws error', async () => {
    mockGetAISelectorActiveState.mockImplementation(() => {
      throw new Error("Internal state error");
    });

    const response = await request(app).get('/api/ai/current-strategy/ANY_SYMBOL_ERR');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
        symbol: 'ANY_SYMBOL_ERR',
        message: "Internal server error while fetching AI strategy choice."
    });
  });

  test('Test Case 5: Symbol parameter is missing', async () => {
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
