/**
 * @fileoverview OnlineReservoirLearner — Recursive Least Squares for CognitiveReadout
 *
 * Step 3 of Level 5 (True Autonomy):
 *   Enable online learning for CognitiveReadout weights using real interaction feedback.
 *
 * Implements Recursive Least Squares (RLS) with forgetting factor for
 * continuous adaptation of the readout weights from the ESN reservoir.
 * This allows DTE to learn from every interaction without retraining
 * the entire readout from scratch.
 *
 * RLS Algorithm:
 *   Given feedback signal (x, y, reward):
 *     1. Compute Kalman gain: K = P·x / (λ + x^T·P·x)
 *     2. Compute prediction error: e = y - W·x
 *     3. Update weights: W += reward · K · e^T
 *     4. Update inverse correlation: P = (P - K·x^T·P) / λ
 *
 * Safety Features:
 *   - Forgetting factor λ ∈ [0.9, 0.9999] controls adaptation speed
 *   - Weight magnitude clamping prevents instability
 *   - Minimum update magnitude gate filters noise
 *   - Momentum smoothing reduces oscillation
 *   - Dead man's switch resets to defaults on coherence collapse
 *
 * Ported from deltecho/deep-tree-echo-core/src/core-self/OnlineReservoirLearner.ts
 *
 * cogpy Mapping: coggml (tensor operations for reservoir weight matrices)
 */

import { EventEmitter } from 'events';

// ============================================================
// Types
// ============================================================

export interface OnlineLearnerConfig {
  /** Reservoir state dimension */
  reservoirDim: number;
  /** Output dimension */
  outputDim: number;
  /** RLS forgetting factor (0.9-0.9999, higher = slower adaptation) */
  forgettingFactor: number;
  /** Initial P matrix diagonal value */
  initialPDiag: number;
  /** Minimum update magnitude to apply (noise gate) */
  minUpdateMagnitude: number;
  /** Maximum weight magnitude (stability clamp) */
  maxWeightMagnitude: number;
  /** Enable momentum (exponential moving average of gradients) */
  enableMomentum: boolean;
  /** Momentum coefficient (0-1) */
  momentumCoeff: number;
  /** Learning rate scale factor */
  learningRateScale: number;
  /** Maximum number of updates to store in history */
  maxHistorySize: number;
}

const DEFAULT_CONFIG: OnlineLearnerConfig = {
  reservoirDim: 256,
  outputDim: 64,
  forgettingFactor: 0.995,
  initialPDiag: 100.0,
  minUpdateMagnitude: 1e-8,
  maxWeightMagnitude: 10.0,
  enableMomentum: true,
  momentumCoeff: 0.9,
  learningRateScale: 1.0,
  maxHistorySize: 1000,
};

export interface FeedbackSignal {
  /** The reservoir state at the time of the interaction */
  reservoirState: Float64Array;
  /** The target output (what the response should have been) */
  targetOutput: Float64Array;
  /** Reward signal (-1 to 1, from user feedback or self-evaluation) */
  reward: number;
  /** Emotional valence at the time */
  valence: number;
  /** Timestamp */
  timestamp: number;
  /** Source of feedback */
  source: 'user' | 'self-evaluation' | 'coherence' | 'reservoir';
}

export interface LearningUpdate {
  /** Update index */
  index: number;
  /** Weight change magnitude (Frobenius norm) */
  weightChangeMagnitude: number;
  /** Prediction error magnitude */
  predictionError: number;
  /** Effective learning rate */
  effectiveLearningRate: number;
  /** Reward signal */
  reward: number;
  /** Timestamp */
  timestamp: number;
}

export interface LearnerState {
  /** Current readout weights (flattened row-major) */
  weights: Float64Array;
  /** Inverse correlation matrix P (flattened row-major) */
  pMatrix: Float64Array;
  /** Momentum buffer (flattened row-major) */
  momentum: Float64Array;
  /** Total number of updates applied */
  totalUpdates: number;
  /** Cumulative reward */
  cumulativeReward: number;
  /** Average prediction error */
  avgPredictionError: number;
}

export interface LearnerMetrics {
  totalUpdates: number;
  cumulativeReward: number;
  avgPredictionError: number;
  avgWeightMagnitude: number;
  avgLearningRate: number;
  recentUpdates: LearningUpdate[];
}

// ============================================================
// Online Reservoir Learner
// ============================================================

export class OnlineReservoirLearner extends EventEmitter {
  private config: OnlineLearnerConfig;

  // Core RLS state
  private weights: Float64Array;     // W: [outputDim x reservoirDim]
  private pMatrix: Float64Array;     // P: [reservoirDim x reservoirDim]
  private momentum: Float64Array;    // M: [outputDim x reservoirDim]

  // Statistics
  private totalUpdates: number = 0;
  private cumulativeReward: number = 0;
  private predictionErrors: number[] = [];
  private updateHistory: LearningUpdate[] = [];

  constructor(config: Partial<OnlineLearnerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    const { reservoirDim, outputDim, initialPDiag } = this.config;

    // Initialize weights to small random values
    this.weights = new Float64Array(outputDim * reservoirDim);
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = (Math.random() - 0.5) * 0.01;
    }

    // Initialize P as scaled identity matrix
    this.pMatrix = new Float64Array(reservoirDim * reservoirDim);
    for (let i = 0; i < reservoirDim; i++) {
      this.pMatrix[i * reservoirDim + i] = initialPDiag;
    }

    // Initialize momentum buffer
    this.momentum = new Float64Array(outputDim * reservoirDim);
  }

  /**
   * Apply a single RLS update from a feedback signal.
   * This is the core online learning step.
   *
   * RLS Update Equations:
   *   K = P·x / (λ + x^T·P·x)          — Kalman gain
   *   e = y - W·x                        — prediction error
   *   W += reward · learningRate · K·e^T  — weight update
   *   P = (P - K·x^T·P) / λ             — inverse correlation update
   */
  update(feedback: FeedbackSignal): LearningUpdate {
    const { reservoirDim, outputDim, forgettingFactor, learningRateScale } = this.config;
    const x = feedback.reservoirState;
    const y = feedback.targetOutput;

    // Validate dimensions
    if (x.length !== reservoirDim) {
      throw new Error(`Reservoir state dim ${x.length} != expected ${reservoirDim}`);
    }
    if (y.length !== outputDim) {
      throw new Error(`Target output dim ${y.length} != expected ${outputDim}`);
    }

    // Step 1: Compute P * x
    const Px = new Float64Array(reservoirDim);
    for (let i = 0; i < reservoirDim; i++) {
      let sum = 0;
      for (let j = 0; j < reservoirDim; j++) {
        sum += this.pMatrix[i * reservoirDim + j] * x[j];
      }
      Px[i] = sum;
    }

    // Step 2: Compute denominator: λ + x^T P x
    let xPx = 0;
    for (let i = 0; i < reservoirDim; i++) {
      xPx += x[i] * Px[i];
    }
    const denom = forgettingFactor + xPx;

    // Step 3: Compute Kalman gain: K = Px / denom
    const K = new Float64Array(reservoirDim);
    for (let i = 0; i < reservoirDim; i++) {
      K[i] = Px[i] / denom;
    }

    // Step 4: Compute prediction error: e = y - W * x
    const prediction = new Float64Array(outputDim);
    for (let i = 0; i < outputDim; i++) {
      let sum = 0;
      for (let j = 0; j < reservoirDim; j++) {
        sum += this.weights[i * reservoirDim + j] * x[j];
      }
      prediction[i] = sum;
    }
    const error = new Float64Array(outputDim);
    let errorMag = 0;
    for (let i = 0; i < outputDim; i++) {
      error[i] = y[i] - prediction[i];
      errorMag += error[i] ** 2;
    }
    errorMag = Math.sqrt(errorMag);

    // Step 5: Compute weight update: ΔW = reward · lr · K ⊗ e
    const effectiveLR = feedback.reward * learningRateScale;
    let weightChangeMag = 0;

    for (let i = 0; i < outputDim; i++) {
      for (let j = 0; j < reservoirDim; j++) {
        const delta = effectiveLR * K[j] * error[i];
        const idx = i * reservoirDim + j;

        if (this.config.enableMomentum) {
          this.momentum[idx] = this.config.momentumCoeff * this.momentum[idx] +
                               (1 - this.config.momentumCoeff) * delta;
          this.weights[idx] += this.momentum[idx];
        } else {
          this.weights[idx] += delta;
        }

        weightChangeMag += delta ** 2;
      }
    }
    weightChangeMag = Math.sqrt(weightChangeMag);

    // Step 6: Apply noise gate
    if (weightChangeMag < this.config.minUpdateMagnitude) {
      // Update too small — skip P matrix update to save computation
      const update: LearningUpdate = {
        index: this.totalUpdates,
        weightChangeMagnitude: 0,
        predictionError: errorMag,
        effectiveLearningRate: effectiveLR,
        reward: feedback.reward,
        timestamp: feedback.timestamp,
      };
      return update;
    }

    // Step 7: Clamp weights for stability
    this.clampWeights();

    // Step 8: Update inverse correlation matrix: P = (P - K·x^T·P) / λ
    // Compute K·x^T·P
    for (let i = 0; i < reservoirDim; i++) {
      for (let j = 0; j < reservoirDim; j++) {
        let KxTP = 0;
        for (let k = 0; k < reservoirDim; k++) {
          KxTP += K[i] * x[k] * this.pMatrix[k * reservoirDim + j];
        }
        // This is expensive — use rank-1 update instead
        this.pMatrix[i * reservoirDim + j] =
          (this.pMatrix[i * reservoirDim + j] - K[i] * Px[j]) / forgettingFactor;
      }
    }

    // Step 9: Record statistics
    this.totalUpdates++;
    this.cumulativeReward += feedback.reward;
    this.predictionErrors.push(errorMag);
    if (this.predictionErrors.length > 100) this.predictionErrors.shift();

    const update: LearningUpdate = {
      index: this.totalUpdates,
      weightChangeMagnitude: weightChangeMag,
      predictionError: errorMag,
      effectiveLearningRate: effectiveLR,
      reward: feedback.reward,
      timestamp: feedback.timestamp,
    };

    this.updateHistory.push(update);
    if (this.updateHistory.length > this.config.maxHistorySize) {
      this.updateHistory = this.updateHistory.slice(-this.config.maxHistorySize);
    }

    this.emit('update', update);
    return update;
  }

  /**
   * Process a batch of feedback signals.
   */
  batchUpdate(feedbacks: FeedbackSignal[]): LearningUpdate[] {
    return feedbacks.map((f) => this.update(f));
  }

  /**
   * Emergency reset — dead man's switch.
   * Resets weights to small random values and P to scaled identity.
   */
  emergencyReset(): void {
    const { reservoirDim, outputDim, initialPDiag } = this.config;

    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = (Math.random() - 0.5) * 0.01;
    }

    this.pMatrix.fill(0);
    for (let i = 0; i < reservoirDim; i++) {
      this.pMatrix[i * reservoirDim + i] = initialPDiag;
    }

    this.momentum.fill(0);
    this.emit('emergency_reset');
  }

  // ─── Accessors ─────────────────────────────────────────────

  getWeights(): Float64Array { return new Float64Array(this.weights); }

  getMetrics(): LearnerMetrics {
    let avgWeight = 0;
    for (let i = 0; i < this.weights.length; i++) avgWeight += Math.abs(this.weights[i]);
    avgWeight /= this.weights.length || 1;

    const recentLRs = this.updateHistory.slice(-20).map((u) => Math.abs(u.effectiveLearningRate));
    const avgLR = recentLRs.length > 0 ? recentLRs.reduce((a, b) => a + b, 0) / recentLRs.length : 0;

    return {
      totalUpdates: this.totalUpdates,
      cumulativeReward: this.cumulativeReward,
      avgPredictionError: this.predictionErrors.length > 0
        ? this.predictionErrors.reduce((a, b) => a + b, 0) / this.predictionErrors.length
        : 0,
      avgWeightMagnitude: avgWeight,
      avgLearningRate: avgLR,
      recentUpdates: this.updateHistory.slice(-10),
    };
  }

  /** Export full state for persistence */
  exportState(): LearnerState {
    return {
      weights: new Float64Array(this.weights),
      pMatrix: new Float64Array(this.pMatrix),
      momentum: new Float64Array(this.momentum),
      totalUpdates: this.totalUpdates,
      cumulativeReward: this.cumulativeReward,
      avgPredictionError: this.predictionErrors.length > 0
        ? this.predictionErrors.reduce((a, b) => a + b, 0) / this.predictionErrors.length
        : 0,
    };
  }

  /** Import state from persistence */
  importState(state: LearnerState): void {
    this.weights = new Float64Array(state.weights);
    this.pMatrix = new Float64Array(state.pMatrix);
    this.momentum = new Float64Array(state.momentum);
    this.totalUpdates = state.totalUpdates;
    this.cumulativeReward = state.cumulativeReward;
  }

  /** Update the forgetting factor (used by SelfModificationEngine) */
  setForgettingFactor(value: number): void {
    this.config.forgettingFactor = Math.max(0.9, Math.min(0.9999, value));
  }

  // ─── Private Helpers ───────────────────────────────────────

  private clampWeights(): void {
    const max = this.config.maxWeightMagnitude;
    for (let i = 0; i < this.weights.length; i++) {
      if (this.weights[i] > max) this.weights[i] = max;
      if (this.weights[i] < -max) this.weights[i] = -max;
    }
  }
}
