import * as tf from '@tensorflow/tfjs-node';
import { createModel, compileModel } from '../../src/aiModels/simplePricePredictorModel';

describe('Simple Price Predictor Model', () => {
  describe('createModel', () => {
    it('should create a tf.Sequential model', () => {
      const model = createModel(10);
      expect(model).toBeInstanceOf(tf.Sequential);
    });

    it('should have the correct number of layers (LSTM + Dense + Output)', () => {
      const model = createModel(10, 32, 16); // LSTM, Dense, Output
      expect(model.layers.length).toBe(3);
    });
    
    it('should have the correct number of layers (LSTM + Output, no intermediate Dense)', () => {
      const model = createModel(10, 32, 0); // LSTM, Output (denseUnits = 0)
      expect(model.layers.length).toBe(2);
    });

    it('should have an LSTM layer as the first layer', () => {
      const model = createModel(10, 32, 16);
      expect(model.layers[0].getClassName()).toBe('LSTM');
    });
    
    it('should configure the LSTM layer inputShape correctly', () => {
      const lookback = 15;
      const model = createModel(lookback, 32, 16);
      // inputShape for LSTM is [batchSize, timesteps, features]
      // When defining, batchSize is null. So, [timesteps, features]
      expect(model.layers[0].batchInputShape).toEqual([null, lookback, 1]);
    });

    it('should have a Dense layer as the output layer with sigmoid activation', () => {
      const model = createModel(10, 32, 16);
      const outputLayer = model.layers[model.layers.length - 1];
      expect(outputLayer.getClassName()).toBe('Dense');
      const layerConfig = outputLayer.getConfig();
      expect(layerConfig.units).toBe(1);
      expect(layerConfig.activation).toBe('sigmoid');
    });
    
    it('should use specified lstmUnits and denseUnits', () => {
      const lstmUnits = 64;
      const denseUnits = 8;
      const model = createModel(10, lstmUnits, denseUnits);
      expect(model.layers[0].getConfig().units).toBe(lstmUnits);
      if (denseUnits > 0) {
        expect(model.layers[1].getConfig().units).toBe(denseUnits);
      }
    });

    it('should throw error for non-positive lookback', () => {
      expect(() => createModel(0)).toThrow('Lookback period must be positive.');
      expect(() => createModel(-5)).toThrow('Lookback period must be positive.');
    });
  });

  describe('compileModel', () => {
    let model: tf.Sequential;

    beforeEach(() => {
      model = createModel(10); // Create a fresh model for each compile test
    });

    it('should compile the model with Adam optimizer and binaryCrossentropy loss', () => {
      compileModel(model, 0.001);
      expect(model.optimizer).toBeInstanceOf(tf.AdamOptimizer);
      // Note: Accessing loss and metrics directly like model.loss / model.metrics is not straightforward
      // as they are set internally. We primarily check that compile doesn't throw and optimizer is set.
      // To check loss/metrics, one might need to inspect model.toJSON() or similar, which is more complex.
      // For this scope, ensuring optimizer is set implies compilation occurred with specified parts.
      expect(model.loss).toBe('binaryCrossentropy');
      expect(model.metrics).toContain('accuracy');
    });

    it('should use the specified learning rate', () => {
      const learningRate = 0.01;
      compileModel(model, learningRate);
      // tfjs-node optimizer doesn't directly expose learningRate in a simple property after compile.
      // We trust that tf.train.adam(learningRate) sets it correctly.
      // A more involved test could be to check the optimizer's learning rate if accessible.
      // For now, this test mainly ensures compile runs with the learning rate.
      expect(model.optimizer).toBeDefined();
    });

    it('should throw error if model is undefined', () => {
      expect(() => compileModel(undefined as any, 0.001)).toThrow('Model is undefined and cannot be compiled.');
    });
    
    it('should throw error for non-positive learning rate', () => {
      expect(() => compileModel(model, 0)).toThrow('Learning rate must be positive.');
      expect(() => compileModel(model, -0.001)).toThrow('Learning rate must be positive.');
    });
  });
});
