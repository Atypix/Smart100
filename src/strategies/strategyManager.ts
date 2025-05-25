// In src/strategies/strategyManager.ts
import { TradingStrategy } from './strategy.types';
import { logger } from '../utils/logger'; // Optional: for logging registration events

// Import strategies to be registered
import { adaptedSimpleThresholdStrategy } from './implementations/simpleThresholdStrategy';
import { ichimokuCloudStrategy } from './implementations/ichimokuStrategy'; // Import Ichimoku strategy
// ... import other strategies here as they are created

const strategyRegistry = new Map<string, TradingStrategy>();

export function registerStrategy(strategy: TradingStrategy): void {
  if (!strategy || !strategy.id) {
    logger.error('StrategyManager: Attempted to register an invalid or ID-less strategy.');
    return;
  }
  if (strategyRegistry.has(strategy.id)) {
    logger.warn(`StrategyManager: Strategy with ID '${strategy.id}' is already registered. It will be overwritten.`);
  }
  strategyRegistry.set(strategy.id, strategy);
  logger.info(`StrategyManager: Strategy '${strategy.name}' (ID: ${strategy.id}) registered.`);
}

export function getStrategy(id: string): TradingStrategy | undefined {
  return strategyRegistry.get(id);
}

export function getAvailableStrategies(): TradingStrategy[] {
  return Array.from(strategyRegistry.values());
}

// --- Auto-register imported strategies ---
// This section ensures that all imported strategy implementations are registered when the manager is loaded.

// Register adaptedSimpleThresholdStrategy
if (adaptedSimpleThresholdStrategy) {
  registerStrategy(adaptedSimpleThresholdStrategy);
} else {
  logger.error('StrategyManager: adaptedSimpleThresholdStrategy is undefined and cannot be registered.');
}

if (ichimokuCloudStrategy) {
  registerStrategy(ichimokuCloudStrategy);
} else {
  logger.error('StrategyManager: ichimokuCloudStrategy is undefined and cannot be registered.');
}

// Example: Register more strategies if they were imported
// import { anotherStrategy } from './implementations/anotherStrategy';
// if (anotherStrategy) {
//   registerStrategy(anotherStrategy);
// }

logger.info(`StrategyManager: Initialized with ${strategyRegistry.size} strategies.`);
