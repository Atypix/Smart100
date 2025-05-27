import { TradingStrategy, StrategyContext, StrategySignal, StrategyParameterDefinition } from '../strategy.types';
import { HistoricalDataPoint } from '../../services/dataService';
import { createPriceSequences, normalizeData } from '../../utils/aiDataUtils';
import { createModel, compileModel } from '../../aiModels/simplePricePredictorModel';
import * as tf from '@tensorflow/tfjs-node';
import logger from '../../utils/logger'; // Corrected import

const aiPricePredictionStrategyParameters: StrategyParameterDefinition[] = [
  { name: 'lookbackPeriod', label: 'Lookback Period', type: 'number', defaultValue: 10, min: 5, max: 50, step: 1 },
  { name: 'predictionHorizon', label: 'Prediction Horizon', type: 'number', defaultValue: 1, min: 1, max: 10, step: 1 },
  { name: 'trainingDataSplit', label: 'Training Data Split Ratio', type: 'number', defaultValue: 0.7, min: 0.1, max: 0.9, step: 0.05 },
  { name: 'epochs', label: 'Training Epochs', type: 'number', defaultValue: 10, min: 1, max: 100, step: 1 },
  { name: 'learningRate', label: 'Learning Rate', type: 'number', defaultValue: 0.01, min: 0.0001, max: 0.1, step: 0.0001 },
  { name: 'lstmUnits', label: 'LSTM Units', type: 'number', defaultValue: 32, min: 8, max: 128, step: 1 },
  { name: 'denseUnits', label: 'Dense Units (0 for none)', type: 'number', defaultValue: 16, min: 0, max: 64, step: 1 },
  { name: 'buyThreshold', label: 'Buy Signal Threshold', type: 'number', defaultValue: 0.6, min: 0.5, max: 1.0, step: 0.01 },
  { name: 'sellThreshold', label: 'Sell Signal Threshold', type: 'number', defaultValue: 0.4, min: 0.0, max: 0.5, step: 0.01 },
  { name: 'tradeAmount', label: 'Trade Amount', type: 'number', defaultValue: 1, min: 0.001, max: 1000, step: 0.001 }, // Added max
];

class AIPricePredictionStrategy implements TradingStrategy {
  id: string = 'ai-price-prediction';
  name: string = 'AI Price Prediction Strategy (Experimental)';
  description: string = 'Uses a simple neural network to predict price movements. Trains once per backtest run.';
  parameters: StrategyParameterDefinition[] = aiPricePredictionStrategyParameters;

  private model: tf.Sequential | null = null;
  private isTrained: boolean = false;
  private normalizationParams: { min: number; max: number } | null = null;

  constructor() {
    // Ensure tfjs-node is loaded (can sometimes help with backend initialization)
    tf.ready().then(() => {
        logger.info('TensorFlow.js Node backend initialized for AIPricePredictionStrategy.');
    }).catch(err => {
        logger.error('Error initializing TensorFlow.js Node backend:', err);
    });
  }
  
  resetState(): void {
    logger.info(`[${this.id}] Resetting strategy state. Disposing model if exists.`);
    if (this.model) {
        this.model.dispose();
    }
    this.model = null;
    this.isTrained = false;
    this.normalizationParams = null;
  }


  async execute(context: StrategyContext): Promise<StrategySignal> {
    const { historicalData, currentIndex, portfolio, parameters } = context;
    const {
      lookbackPeriod,
      predictionHorizon,
      trainingDataSplit,
      epochs,
      learningRate,
      lstmUnits,
      denseUnits,
      buyThreshold,
      sellThreshold,
      tradeAmount
    } = parameters as {
      lookbackPeriod: number; predictionHorizon: number; trainingDataSplit: number;
      epochs: number; learningRate: number; lstmUnits: number; denseUnits: number;
      buyThreshold: number; sellThreshold: number; tradeAmount: number;
    };

    try {
      if (!this.isTrained) {
        logger.info(`[${this.id}] Model not trained. Starting training process...`);
        
        const splitPoint = Math.floor(historicalData.length * trainingDataSplit);
        if (splitPoint < lookbackPeriod + predictionHorizon || historicalData.length - splitPoint < lookbackPeriod + 1) {
            logger.error(`[${this.id}] Not enough data for training and subsequent prediction. Total: ${historicalData.length}, Split: ${splitPoint}, Lookback: ${lookbackPeriod}, Horizon: ${predictionHorizon}`);
            return { action: 'HOLD' };
        }

        const trainingFullData = historicalData.slice(0, splitPoint);
        const trainingClosePrices = trainingFullData.map(d => d.close);

        if (trainingClosePrices.length < lookbackPeriod + predictionHorizon) {
             logger.error(`[${this.id}] Not enough trainingClosePrices for a single sequence. Length: ${trainingClosePrices.length}, Need: ${lookbackPeriod + predictionHorizon}`);
            return { action: 'HOLD' };
        }
        
        const { sequences: trainSequences, targets: trainTargets } = createPriceSequences(
          trainingClosePrices,
          lookbackPeriod,
          predictionHorizon
        );

        if (trainSequences.length === 0) {
          logger.error(`[${this.id}] No training sequences could be created from data up to splitPoint ${splitPoint}.`);
          return { action: 'HOLD' };
        }

        const { normalizedSequences, minMax } = normalizeData(trainSequences);
        this.normalizationParams = minMax;

        const trainTensor = tf.tensor2d(normalizedSequences, [normalizedSequences.length, lookbackPeriod]);
        // Reshape for LSTM: [samples, timesteps, features]
        const trainTensorReshaped = trainTensor.reshape([normalizedSequences.length, lookbackPeriod, 1]);
        const targetTensor = tf.tensor1d(trainTargets);
        
        this.model = createModel(lookbackPeriod, lstmUnits, denseUnits);
        compileModel(this.model, learningRate);

        logger.info(`[${this.id}] Starting model training. Sequences: ${trainSequences.length}, Epochs: ${epochs}, LR: ${learningRate}`);
        await this.model.fit(trainTensorReshaped, targetTensor, {
          epochs,
          batchSize: Math.max(1, Math.floor(trainTensorReshaped.shape[0] / 10)), // e.g. 10% of data as batch size
          verbose: 0, // 0 for silent, 1 for progress bar
          // callbacks: { onEpochEnd: (epoch, logs) => { logger.debug(`Epoch ${epoch+1}/${epochs} - loss: ${logs?.loss?.toFixed(4)} - acc: ${logs?.acc?.toFixed(4)}`); }}
        });
        
        this.isTrained = true;
        logger.info(`[${this.id}] Model training completed.`);

        tf.dispose([trainTensor, trainTensorReshaped, targetTensor]);
      } // End of training block

      // Prediction Block
      if (this.isTrained && this.model && this.normalizationParams) {
        if (currentIndex < lookbackPeriod - 1) {
          // logger.debug(`[${this.id}] Not enough data for prediction at currentIndex ${currentIndex}. Need ${lookbackPeriod -1}. Holding.`);
          return { action: 'HOLD' };
        }

        const currentPriceData = historicalData
          .slice(currentIndex - lookbackPeriod + 1, currentIndex + 1)
          .map(d => d.close);

        if (currentPriceData.length < lookbackPeriod) {
            // logger.warn(`[${this.id}] Sliced price data for prediction is too short. Index: ${currentIndex}, Lookback: ${lookbackPeriod}. Holding.`);
            return { action: 'HOLD' };
        }
        
        const { normalizedSequences: normalizedCurrentSequenceWrapper } = normalizeData(
            [currentPriceData], // normalizeData expects array of sequences
            this.normalizationParams
        );
        
        if (normalizedCurrentSequenceWrapper.length === 0 || normalizedCurrentSequenceWrapper[0].length === 0) {
            logger.warn(`[${this.id}] Normalization of current sequence failed or produced empty result. Index: ${currentIndex}. Holding.`);
            return { action: 'HOLD' };
        }
        const normalizedCurrentSequence = normalizedCurrentSequenceWrapper[0];

        const inputTensor = tf.tensor2d([normalizedCurrentSequence], [1, lookbackPeriod]);
        const inputTensorReshaped = inputTensor.reshape([1, lookbackPeriod, 1]); // Reshape for LSTM
        
        const predictionTensor = this.model.predict(inputTensorReshaped) as tf.Tensor;
        const predictionValues = await predictionTensor.data();
        const predictionValue = predictionValues[0];

        tf.dispose([inputTensor, inputTensorReshaped, predictionTensor]);

        const currentPrice = historicalData[currentIndex].close;

        if (predictionValue >= buyThreshold) {
          if (portfolio.cash >= currentPrice * tradeAmount) {
            // logger.info(`[${this.id}] BUY signal: Prediction ${predictionValue.toFixed(3)} >= ${buyThreshold}. Price ${currentPrice.toFixed(2)}`);
            return { action: 'BUY', amount: tradeAmount };
          }
          // logger.debug(`[${this.id}] BUY condition met (Pred: ${predictionValue.toFixed(3)}) but insufficient cash. Holding.`);
        } else if (predictionValue <= sellThreshold) {
          if (portfolio.shares >= tradeAmount) {
            // logger.info(`[${this.id}] SELL signal: Prediction ${predictionValue.toFixed(3)} <= ${sellThreshold}. Price ${currentPrice.toFixed(2)}`);
            return { action: 'SELL', amount: tradeAmount };
          }
          // logger.debug(`[${this.id}] SELL condition met (Pred: ${predictionValue.toFixed(3)}) but insufficient shares. Holding.`);
        } else {
          // logger.debug(`[${this.id}] HOLD signal: Prediction ${predictionValue.toFixed(3)} between thresholds. Price ${currentPrice.toFixed(2)}`);
        }
      } else if (this.isTrained && (!this.model || !this.normalizationParams)) {
        logger.error(`[${this.id}] Model is marked as trained but model or normalizationParams are missing. Holding.`);
      }

    } catch (error) {
      logger.error(`[${this.id}] Error during execute:`, error);
      // If error occurs, reset model so it retrains on next valid opportunity if that's desired,
      // or handle more gracefully. For now, just log and hold.
      // this.resetState(); // Optional: uncomment to force retrain on next call after an error
    }

    return { action: 'HOLD' };
  }
}

export const aiPricePredictionStrategy = new AIPricePredictionStrategy();

// Add a method to the class prototype for StrategyManager to call upon new backtest run if needed.
// This is important because the class instance is created once when StrategyManager loads it.
// For multiple backtests (e.g. via JSON config), state needs to be reset.
(AIPricePredictionStrategy.prototype as any).reset = function() {
    (this as AIPricePredictionStrategy).resetState();
};
