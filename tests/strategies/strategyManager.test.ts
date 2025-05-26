// In tests/strategies/strategyManager.test.ts
import { TradingStrategy, StrategyParameterDefinition, StrategySignal, StrategyContext } from '../../src/strategies/strategy.types';
import { registerStrategy, getStrategy, getAvailableStrategies } from '../../src/strategies/strategyManager';
import logger from '../../src/utils/logger'; // Corrected import

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  default: { // Corrected mock for default export
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

// Define some mock strategies for testing
const mockStrategy1Params: StrategyParameterDefinition[] = [
  { name: 'period', label: 'Period', type: 'number', defaultValue: 10 },
];
const mockStrategy1Execute = jest.fn((context: StrategyContext): StrategySignal => ({ action: 'HOLD' }));
const mockStrategy1: TradingStrategy = {
  id: 'mock-strat-1',
  name: 'Mock Strategy 1',
  description: 'A mock strategy for testing.',
  parameters: mockStrategy1Params,
  execute: mockStrategy1Execute,
};

const mockStrategy2Params: StrategyParameterDefinition[] = [
  { name: 'level', label: 'Level', type: 'number', defaultValue: 70 },
];
const mockStrategy2Execute = jest.fn((context: StrategyContext): StrategySignal => ({ action: 'BUY', amount: 1 }));
const mockStrategy2: TradingStrategy = {
  id: 'mock-strat-2',
  name: 'Mock Strategy 2',
  description: 'Another mock strategy.',
  parameters: mockStrategy2Params,
  execute: mockStrategy2Execute,
};

describe('StrategyManager', () => {
  // Clear the registry before each test.
  // This is tricky because the registry is module-scoped in strategyManager.ts
  // and strategies (like simpleThresholdStrategy) are auto-registered upon import.
  // For true isolation, we might need a clearRegistry function in strategyManager.ts,
  // or test getAvailableStrategies based on the known auto-registered strategies + new ones.
  // For now, we'll assume the auto-registration of simple-threshold and ichimoku will happen.
  // To test an empty state, we'd need to mock the imports within strategyManager.ts itself, which is complex.
  // Let's test based on what's registered by default + what we add.

  // A helper to clear mocks and potentially reset parts of the module if possible
  // This won't clear the actual strategyRegistry Map in strategyManager.ts without a dedicated function there.
  beforeEach(() => {
    jest.clearAllMocks();
    // Note: The strategyRegistry in strategyManager.ts is not cleared here.
    // Tests will operate on the existing state of the registry (which includes auto-registered strategies).
  });

  describe('registerStrategy and getStrategy', () => {
    test('should register a new strategy and allow retrieval', () => {
      registerStrategy(mockStrategy1);
      const retrieved = getStrategy('mock-strat-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('mock-strat-1');
      expect(retrieved?.name).toBe('Mock Strategy 1');
      expect(logger.info).toHaveBeenCalledWith("StrategyManager: Strategy 'Mock Strategy 1' (ID: mock-strat-1) registered.");
    });

    test('getStrategy should return undefined for a non-existent ID', () => {
      const retrieved = getStrategy('non-existent-id');
      expect(retrieved).toBeUndefined();
    });

    test('registerStrategy should overwrite an existing strategy with the same ID and log a warning', () => {
      // First registration (mockStrategy1 might be registered if tests run sequentially without reset,
      // but let's ensure it's the one we control for this test)
      registerStrategy({ ...mockStrategy1, name: "Original Mock Strategy 1" }); 
      
      const updatedMockStrategy1: TradingStrategy = {
        ...mockStrategy1,
        name: 'Updated Mock Strategy 1',
        description: 'Updated description.',
      };
      registerStrategy(updatedMockStrategy1);

      const retrieved = getStrategy('mock-strat-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Updated Mock Strategy 1');
      expect(retrieved?.description).toBe('Updated description.');
      expect(logger.warn).toHaveBeenCalledWith("StrategyManager: Strategy with ID 'mock-strat-1' is already registered. It will be overwritten.");
    });
    
    test('registerStrategy should not register if strategy or strategy.id is invalid/missing and log an error', () => {
        registerStrategy(null as any);
        expect(logger.error).toHaveBeenCalledWith('StrategyManager: Attempted to register an invalid or ID-less strategy.');
        
        (logger.error as jest.Mock).mockClear(); // Clear mock for next check
        
        registerStrategy({ name: 'No ID Strategy' } as any);
        expect(logger.error).toHaveBeenCalledWith('StrategyManager: Attempted to register an invalid or ID-less strategy.');
    });
  });

  describe('getAvailableStrategies', () => {
    // Note: adaptedSimpleThresholdStrategy and ichimokuCloudStrategy are auto-registered when strategyManager.ts is imported.
    // So, the list will never be truly empty unless we mock those imports.
    
    test('should return an array of all registered strategies', () => {
      // Strategies are registered when strategyManager.ts is loaded.
      // Let's assume 'simple-threshold' and 'ichimoku-cloud' are auto-registered.
      // We register one more for this test.
      registerStrategy(mockStrategy2);

      const available = getAvailableStrategies();
      
      // Check if it's an array
      expect(Array.isArray(available)).toBe(true);
      
      // Check if all known registered strategies are present
      const ids = available.map(s => s.id);
      expect(ids).toContain('simple-threshold'); // Auto-registered
      expect(ids).toContain('ichimoku-cloud');   // Auto-registered
      expect(ids).toContain('mock-strat-2');     // Registered in this test block

      // Verify one of the strategies' details
      const foundMockStrategy2 = available.find(s => s.id === 'mock-strat-2');
      expect(foundMockStrategy2).toEqual(mockStrategy2);
    });

    test('should reflect the correct number of strategies after multiple registrations', () => {
        // Get initial count (includes auto-registered ones)
        const initialCount = getAvailableStrategies().length;

        const tempStrategy3: TradingStrategy = { id: 'temp-strat-3', name: 'Temp Strat 3', parameters: [], execute: jest.fn() };
        const tempStrategy4: TradingStrategy = { id: 'temp-strat-4', name: 'Temp Strat 4', parameters: [], execute: jest.fn() };
        
        registerStrategy(tempStrategy3);
        registerStrategy(tempStrategy4);
        
        const available = getAvailableStrategies();
        // initialCount could be 2 if simple-threshold and ichimoku are the only auto-registered ones.
        // This test is a bit fragile if auto-registration changes.
        // A better way would be to clear the registry if possible.
        // For now, check relative increase.
        expect(available.length).toBeGreaterThanOrEqual(initialCount + 2 - (available.find(s => s.id === tempStrategy3.id) ? 0:1) - (available.find(s => s.id === tempStrategy4.id) ? 0:1) ); // accounts for potential re-registration if tests run out of order or registry isn't fully clean
        
        // A more robust check specific to this test's additions:
        const ids = available.map(s => s.id);
        expect(ids).toContain('temp-strat-3');
        expect(ids).toContain('temp-strat-4');
    });
  });
});
