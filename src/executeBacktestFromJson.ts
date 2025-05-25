// In src/executeBacktestFromJson.ts
import fs from 'fs';
import path from 'path';
import { runBacktest, BacktestResult } from './backtest'; // Assuming runBacktest and BacktestResult are exported from src/backtest/index.ts
import { getStrategy, getAvailableStrategies } from './strategies'; // Assuming these are exported from src/strategies/index.ts
import { logger } from './utils/logger'; // For consistent logging

interface BacktestConfigEntry {
  symbol: string;
  startDate: string;
  endDate: string;
  initialCash: number;
  strategyId: string;
  strategyParams: Record<string, number | string | boolean>;
  sourceApi?: string;
  interval?: string;
}

async function main() {
  logger.info('Starting backtest execution from JSON configuration...');

  let configs: BacktestConfigEntry[];
  const configPath = path.resolve(__dirname, '../../backtestConfig.json'); // Resolve path from dist/src to project root

  try {
    logger.info(`Reading backtest configuration from: ${configPath}`);
    const configFile = fs.readFileSync(configPath, 'utf-8');
    const parsedConfig = JSON.parse(configFile);

    // Support both single object and array of objects
    if (Array.isArray(parsedConfig)) {
      configs = parsedConfig;
    } else if (typeof parsedConfig === 'object' && parsedConfig !== null) {
      configs = [parsedConfig];
    } else {
      logger.error('Invalid configuration format in backtestConfig.json. Expected an object or an array of objects.');
      process.exit(1);
    }

  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.error(`Error parsing backtestConfig.json: ${error.message}`);
    } else if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.error(`Error: backtestConfig.json not found at ${configPath}`);
    } else {
      logger.error(`Error reading backtestConfig.json: ${error}`);
    }
    process.exit(1);
  }
  
  if (configs.length === 0) {
    logger.info('No backtest configurations found in backtestConfig.json.');
    return;
  }

  logger.info(`Found ${configs.length} backtest configuration(s) to execute.`);

  // Display available strategies once
  const availableStrategies = getAvailableStrategies();
  logger.info('Available strategies in the system:');
  availableStrategies.forEach(strat => {
    logger.info(`  - ID: ${strat.id}, Name: ${strat.name}`);
  });
  logger.info('---');


  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    logger.info(`Executing backtest ${i + 1} of ${configs.length}: Symbol ${config.symbol}, Strategy ID ${config.strategyId}`);

    // Validate required fields
    if (!config.symbol || !config.startDate || !config.endDate || !config.initialCash || !config.strategyId || !config.strategyParams) {
      logger.error('Missing required fields in a configuration entry:', { config });
      continue; // Skip this configuration
    }

    const strategyInfo = getStrategy(config.strategyId);
    if (!strategyInfo) {
      logger.error(`Strategy with ID '${config.strategyId}' not found for symbol ${config.symbol}! Skipping this backtest.`);
      logger.error(`Ensure the strategy ID in your config matches one of the available strategy IDs.`);
      continue; // Skip this configuration
    }

    logger.info(`Selected Strategy: ${strategyInfo.name} (ID: ${strategyInfo.id})`);
    if (strategyInfo.description) {
      logger.info(`Description: ${strategyInfo.description}`);
    }
    logger.info(`Parameters to be used for ${strategyInfo.name}:`, config.strategyParams);
    logger.info('---');

    try {
      const startDate = new Date(config.startDate);
      const endDate = new Date(config.endDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        logger.error(`Invalid date format for startDate or endDate in configuration for ${config.symbol}. Use YYYY-MM-DD. Skipping.`);
        continue;
      }
      
      logger.info(`Running backtest for ${config.symbol} from ${config.startDate} to ${config.endDate} with strategy ${strategyInfo.name}.`);

      const result: BacktestResult = await runBacktest(
        config.symbol,
        startDate,
        endDate,
        config.initialCash,
        config.strategyId,
        config.strategyParams,
        config.sourceApi,
        config.interval
      );

      logger.info(`Backtest Result for ${config.symbol} with strategy ${strategyInfo.name}:`);
      // Using console.log for structured output of result for better readability
      console.log(JSON.stringify(result, null, 2)); 
      logger.info('---');

    } catch (error) {
      logger.error(`Error during backtest execution for ${config.symbol} with strategy ${strategyInfo.name}:`, error);
      logger.info('---');
    }
  }
  logger.info('All configured backtests have been processed.');
}

main().catch(error => {
  logger.error("Unhandled error in main execution:", error);
  process.exit(1);
});
