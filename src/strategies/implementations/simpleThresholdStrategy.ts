// In src/strategies/implementations/simpleThresholdStrategy.ts
import { TradingStrategy, StrategyContext, StrategySignal, StrategyParameterDefinition } from '../strategy.types';

const simpleThresholdStrategyParams: StrategyParameterDefinition[] = [
  { name: 'upperThreshold', label: 'Upper Threshold', type: 'number', defaultValue: 150, description: 'Price above which to buy.' },
  { name: 'lowerThreshold', label: 'Lower Threshold', type: 'number', defaultValue: 140, description: 'Price below which to sell.' },
  { name: 'tradeAmount', label: 'Trade Amount', type: 'number', defaultValue: 1, description: 'Number of shares to trade.'}
];

export const adaptedSimpleThresholdStrategy: TradingStrategy = {
  id: 'simple-threshold',
  name: 'Simple Threshold Strategy',
  description: 'Buys if price > upperThreshold, Sells if price < lowerThreshold.',
  parameters: simpleThresholdStrategyParams,
  execute: (context: StrategyContext): StrategySignal => {
    const currentDataPoint = context.historicalData[context.currentIndex];
    const price = currentDataPoint.close;
    // Ensure parameters are accessed correctly, potentially with type assertion or validation
    const upperThreshold = context.parameters.upperThreshold as number;
    const lowerThreshold = context.parameters.lowerThreshold as number;
    const tradeAmount = context.parameters.tradeAmount as number;

    if (price > upperThreshold && context.portfolio.cash >= price * tradeAmount) {
      return { action: 'BUY', amount: tradeAmount };
    } else if (price < lowerThreshold && context.portfolio.shares >= tradeAmount) {
      return { action: 'SELL', amount: tradeAmount };
    } else {
      return { action: 'HOLD' };
    }
  },
};
