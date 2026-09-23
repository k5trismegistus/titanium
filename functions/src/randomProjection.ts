import { SOURCE_VECTOR_DIMENSION, VECTOR_DIMENSION } from './vectorConfig';

const PROJECTION_SEED = 0x9e3779b9;
const LCG_MULT = 1664525;
const LCG_INC = 1013904223;

let cachedMatrix: Float32Array | null = null;

const buildProjectionMatrix = (): Float32Array => {
  const total = SOURCE_VECTOR_DIMENSION * VECTOR_DIMENSION;
  const matrix = new Float32Array(total);
  const scale = 1 / Math.sqrt(VECTOR_DIMENSION);
  let state = PROJECTION_SEED >>> 0;

  for (let i = 0; i < total; i += 1) {
    state = (state * LCG_MULT + LCG_INC) >>> 0;
    const sign = state >>> 31 === 1 ? 1 : -1;
    matrix[i] = sign * scale;
  }

  return matrix;
};

const getProjectionMatrix = (): Float32Array => {
  if (!cachedMatrix) {
    cachedMatrix = buildProjectionMatrix();
  }
  return cachedMatrix;
};

export const applyRandomProjection = (values: number[]): number[] => {
  if (values.length !== SOURCE_VECTOR_DIMENSION) {
    console.error(
      `Projection input dimension mismatch: expected ${SOURCE_VECTOR_DIMENSION}, got ${values.length}`,
    );
    return [];
  }

  const matrix = getProjectionMatrix();
  const output = new Array<number>(VECTOR_DIMENSION);

  for (let i = 0; i < VECTOR_DIMENSION; i += 1) {
    let sum = 0;
    const rowOffset = i * SOURCE_VECTOR_DIMENSION;
    for (let j = 0; j < SOURCE_VECTOR_DIMENSION; j += 1) {
      const value = values[j];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return [];
      }
      sum += value * matrix[rowOffset + j];
    }
    output[i] = sum;
  }

  return output;
};
