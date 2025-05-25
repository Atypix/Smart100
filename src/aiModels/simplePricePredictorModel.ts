import * as tf from '@tensorflow/tfjs-node';

/**
 * Creates a simple sequential model for price prediction.
 *
 * @param lookback - The number of past time steps in each input sequence.
 * @param lstmUnits - Optional: Number of units for the LSTM layer (default: 32).
 * @param denseUnits - Optional: Number of units for the Dense layer after LSTM (default: 16).
 * @returns A tf.Sequential model.
 */
export function createModel(
  lookback: number,
  lstmUnits: number = 32,
  denseUnits: number = 16
): tf.Sequential {
  if (lookback <= 0) {
    throw new Error('Lookback period must be positive.');
  }

  const model = tf.sequential();

  // Input Layer (implicitly defined by the first layer's inputShape)
  // LSTM Layer
  model.add(tf.layers.lstm({
    units: lstmUnits,
    inputShape: [lookback, 1], // [lookback timesteps, 1 feature per timestep]
    returnSequences: false, // False because the next layer is Dense, expecting flat input per sequence
  }));

  // Dense Layer (Optional)
  if (denseUnits > 0) {
    model.add(tf.layers.dense({
      units: denseUnits,
      activation: 'relu',
    }));
  }

  // Output Layer
  model.add(tf.layers.dense({
    units: 1, // Binary classification (price higher or lower)
    activation: 'sigmoid', // Outputs a probability between 0 and 1
  }));

  return model;
}

/**
 * Compiles a TensorFlow.js sequential model for binary classification.
 *
 * @param model - The tf.Sequential model to compile.
 * @param learningRate - The learning rate for the Adam optimizer.
 */
export function compileModel(model: tf.Sequential, learningRate: number): void {
  if (!model) {
    throw new Error('Model is undefined and cannot be compiled.');
  }
  if (learningRate <= 0) {
    throw new Error('Learning rate must be positive.');
  }

  model.compile({
    optimizer: tf.train.adam(learningRate),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy'],
  });
}
