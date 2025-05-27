// In src/strategies/strategyManager.ts
import { TradingStrategy } from './strategy.types';
import logger from '../utils/logger'; // Optional: for logging registration events

// Import strategies to be registered
import { adaptedSimpleThresholdStrategy } from './implementations/simpleThresholdStrategy';
import { ichimokuCloudStrategy } from './implementations/ichimokuStrategy'; // Import Ichimoku strategy
import { rsiBollingerStrategy } from './implementations/rsiBollingerStrategy';
import { macdStrategy } from './implementations/macdStrategy';
import { aiPricePredictionStrategy } from './implementations/aiPricePredictionStrategy';
import { aiSelectorStrategy } from './implementations/aiSelectorStrategy'; // Import AI Selector Strategy
// ... import other strategies here as they are created

const strategyRegistry = new Map<string, TradingStrategy<any>>();

export function registerStrategy(strategy: TradingStrategy<any>): void {
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

export function getStrategy(id: string): TradingStrategy<any> | undefined {
  const strategy = strategyRegistry.get(id);
  if (strategy && typeof (strategy as any).reset === 'function') {
    logger.info(`[StrategyManager] Resetting state for strategy ID: ${id}`);
    (strategy as any).reset();
  }
  return strategy;
}

export function getAvailableStrategies(): TradingStrategy<any>[] {
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

if (rsiBollingerStrategy) {
  registerStrategy(rsiBollingerStrategy);
} else {
  logger.error('StrategyManager: rsiBollingerStrategy is undefined and cannot be registered.');
}

if (macdStrategy) {
  registerStrategy(macdStrategy);
} else {
  logger.error('StrategyManager: macdStrategy is undefined and cannot be registered.');
}

if (aiPricePredictionStrategy) {
  registerStrategy(aiPricePredictionStrategy);
} else {
  logger.error('StrategyManager: aiPricePredictionStrategy is undefined and cannot be registered.');
}

// Example: Register more strategies if they were imported
// import { anotherStrategy } from './implementations/anotherStrategy';
// if (anotherStrategy) {
//   registerStrategy(anotherStrategy);
// }

if (aiSelectorStrategy) {
  registerStrategy(aiSelectorStrategy);
} else {
  logger.error('StrategyManager: aiSelectorStrategy is undefined and cannot be registered.');
}

logger.info(`StrategyManager: Initialized with ${strategyRegistry.size} strategies.`);
