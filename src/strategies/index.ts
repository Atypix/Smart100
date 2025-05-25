// In src/strategies/index.ts

// Export strategy type definitions
export * from './strategy.types';

// Export strategy manager functions
export * from './strategyManager';

// Export specific strategy implementations
// This makes them available for registration in the manager or for direct use if needed.
export * from './implementations/simpleThresholdStrategy';
// Add other strategy exports here as they are created in the implementations folder
// e.g., export * from './implementations/movingAverageCrossoverStrategy';
