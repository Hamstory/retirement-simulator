export * from '../../src/engine.js';
export function near(actual, expected, message = '') {
  if (Math.abs(actual - expected) > 1e-7 * Math.max(1, Math.abs(expected))) {
    throw new Error(`${message}: ${actual} != ${expected}`);
  }
}
