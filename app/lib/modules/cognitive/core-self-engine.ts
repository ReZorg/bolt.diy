/**
 * @fileoverview CoreSelfEngine — Master Orchestrator for DTE Persistent Core Self
 *
 * Step 2 of Level 5 (True Autonomy):
 *   Wire CoreSelfEngine end-to-end connecting AutonomyPipeline and Echobeats.
 *
 * Integrates three layers into a unified cognitive engine:
 *   Layer 1: Lucy GGUF (persistent local LLM via LucyInferenceDriver)
 *   Layer 2: ESN Reservoir (cognitive dynamics via ReservoirBridge)
 *   Layer 3: Identity Mesh (persistent self-model via IdentityMesh)
 *
 * Processing pipeline:
 *   1. Input → text embedding → reservoir step (Arena)
 *   2. Reservoir state → readout (Agent)
 *   3. AAR state → modulate system prompt → Lucy inference
 *   4. Lucy output → update identity mesh → update reservoir
 *   5. Return response with cognitive metadata
 *
 * Ported from deltecho/deep-tree-echo-core/src/core-self/CoreSelfEngine.ts
 * and adapted for bolt.diy + tutorialkit composed platform.
 *
 * cogpy Mapping: cognu-mach (microkernel cognitive extensions)
 */

import { EventEmitter } from 'events';
import {
  LucyInferenceDriver,
  modulateSystemPrompt,
  type LucyDriverConfig,
  type ChatMessage,
  type InferenceResult,
} from './lucy-inference-driver';

// ============================================================
// Reservoir Bridge (inline for bolt.diy — no separate package)
// ============================================================

/** Seeded PRNG for reproducible reservoir initialization */
class SeededRNG {
  private s: Uint32Array;

  constructor(seed: number = 42) {
    this.s = new Uint32Array(4);
    this.s[0] = seed;
    this.s[1] = seed ^ 0x6c078965;
    this.s[2] = seed ^ 0x9908b0df;
    this.s[3] = seed ^ 0x9d2c5680;
  }

  next(): number {
    let t = this.s[3];
    t ^= t << 11;
    t ^= t >>> 8;
    this.s[3] = this.s[2];
    this.s[2] = this.s[1];
    this.s[1] = this.s[0];
    t ^= this.s[0];
    t ^= this.s[0] >>> 19;
    this.s[0] = t;
    return (t >>> 0) / 4294967296;
  }

  nextGaussian(): number {
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  }
}

/** ESN Reservoir Configuration */
export interface ESNConfig {
  /** Number of reservoir units */
  units: number;
  /** Spectral radius of recurrent weight matrix */
  spectralRadius: number;
  /** Leaking rate (0-1) */
  leakingRate: number;
  /** Input scaling factor */
  inputScaling: number;
  /** Input dimension */
  inputDim: number;
  /** Sparsity of recurrent connections (0-1) */
  sparsity: number;
  /** Random seed for reproducibility */
  seed: number;
  /** Enable dual-rate dynamics (fast + slow) */
  dualRate: boolean;
  /** Slow rate leaking factor */
  slowLeakingRate: number;
}

const DEFAULT_ESN_CONFIG: ESNConfig = {
  units: 256,
  spectralRadius: 0.95,
  leakingRate: 0.3,
  inputScaling: 0.5,
  inputDim: 128,
  sparsity: 0.9,
  seed: 42,
  dualRate: true,
  slowLeakingRate: 0.05,
};

/** Echo State Network Reservoir */
export class EchoReservoir {
  private config: ESNConfig;
  private rng: SeededRNG;
  private Win: Float64Array;     // Input weights [units x inputDim]
  private W: Float64Array;       // Recurrent weights [units x units]
  private stateFast: Float64Array;
  private stateSlow: Float64Array;
  private tick: number = 0;
  private initialized: boolean = false;

  constructor(config: Partial<ESNConfig> = {}) {
    this.config = { ...DEFAULT_ESN_CONFIG, ...config };
    this.rng = new SeededRNG(this.config.seed);
    this.Win = new Float64Array(this.config.units * this.config.inputDim);
    this.W = new Float64Array(this.config.units * this.config.units);
    this.stateFast = new Float64Array(this.config.units);
    this.stateSlow = new Float64Array(this.config.units);
    this.initialize();
  }

  private initialize(): void {
    const { units, inputDim, sparsity, spectralRadius, inputScaling } = this.config;

    // Initialize input weights
    for (let i = 0; i < units * inputDim; i++) {
      this.Win[i] = this.rng.nextGaussian() * inputScaling;
    }

    // Initialize sparse recurrent weights
    for (let i = 0; i < units; i++) {
      for (let j = 0; j < units; j++) {
        if (this.rng.next() > sparsity) {
          this.W[i * units + j] = this.rng.nextGaussian();
        }
      }
    }

    // Scale to target spectral radius (approximate)
    let maxEig = 0;
    for (let iter = 0; iter < 20; iter++) {
      const v = new Float64Array(units);
      for (let i = 0; i < units; i++) v[i] = this.rng.nextGaussian();
      const Wv = new Float64Array(units);
      for (let i = 0; i < units; i++) {
        let sum = 0;
        for (let j = 0; j < units; j++) sum += this.W[i * units + j] * v[j];
        Wv[i] = sum;
      }
      let norm = 0;
      for (let i = 0; i < units; i++) norm += Wv[i] ** 2;
      maxEig = Math.max(maxEig, Math.sqrt(norm));
    }

    if (maxEig > 0) {
      const scale = spectralRadius / maxEig;
      for (let i = 0; i < this.W.length; i++) this.W[i] *= scale;
    }

    this.initialized = true;
  }

  /** Step the reservoir with input, returning the new state */
  step(input: Float64Array | number[]): Float64Array {
    const { units, inputDim, leakingRate } = this.config;
    const u = input instanceof Float64Array ? input : new Float64Array(input);

    // Compute Win * u
    const Winu = new Float64Array(units);
    for (let i = 0; i < units; i++) {
      let sum = 0;
      for (let j = 0; j < Math.min(inputDim, u.length); j++) {
        sum += this.Win[i * inputDim + j] * u[j];
      }
      Winu[i] = sum;
    }

    // Compute W * x(t)
    const Wx = new Float64Array(units);
    for (let i = 0; i < units; i++) {
      let sum = 0;
      for (let j = 0; j < units; j++) {
        sum += this.W[i * units + j] * this.stateFast[j];
      }
      Wx[i] = sum;
    }

    // Leaky integrator update: x(t+1) = (1-α)x(t) + α·tanh(Wx + Win·u)
    for (let i = 0; i < units; i++) {
      this.stateFast[i] = (1 - leakingRate) * this.stateFast[i] +
                          leakingRate * Math.tanh(Wx[i] + Winu[i]);
    }

    // Dual-rate: slow state tracks exponential moving average
    if (this.config.dualRate) {
      const α = this.config.slowLeakingRate;
      for (let i = 0; i < units; i++) {
        this.stateSlow[i] = (1 - α) * this.stateSlow[i] + α * this.stateFast[i];
      }
    }

    this.tick++;
    return new Float64Array(this.stateFast);
  }

  getState(): Float64Array { return new Float64Array(this.stateFast); }
  getSlowState(): Float64Array { return new Float64Array(this.stateSlow); }
  getTick(): number { return this.tick; }
  getUnits(): number { return this.config.units; }
}

/** Cognitive Readout — maps reservoir state to output */
export class CognitiveReadout {
  private weights: Float64Array | null = null;
  private bias: Float64Array | null = null;
  private inputDim: number = 0;
  private outputDim: number;
  private trained: boolean = false;

  constructor(outputDim: number = 64) {
    this.outputDim = outputDim;
  }

  /** Train readout via ridge regression */
  train(X: Float64Array[], Y: Float64Array[], ridge: number = 1e-4): void {
    const N = X.length;
    if (N === 0) return;
    this.inputDim = X[0].length;
    const D = this.inputDim;
    const O = this.outputDim;

    // X^T X + λI
    const XtX = new Float64Array(D * D);
    for (let i = 0; i < D; i++) {
      for (let j = 0; j < D; j++) {
        let sum = 0;
        for (let n = 0; n < N; n++) sum += X[n][i] * X[n][j];
        XtX[i * D + j] = sum + (i === j ? ridge : 0);
      }
    }

    // X^T Y
    const XtY = new Float64Array(D * O);
    for (let i = 0; i < D; i++) {
      for (let j = 0; j < O; j++) {
        let sum = 0;
        for (let n = 0; n < N; n++) sum += X[n][i] * Y[n][j];
        XtY[i * O + j] = sum;
      }
    }

    // Solve via gradient descent
    this.weights = new Float64Array(D * O);
    this.bias = new Float64Array(O);
    const lr = 0.001;
    for (let iter = 0; iter < 1000; iter++) {
      for (let o = 0; o < O; o++) {
        for (let d = 0; d < D; d++) {
          let grad = 0;
          for (let i = 0; i < D; i++) {
            grad += XtX[d * D + i] * this.weights[i * O + o];
          }
          grad -= XtY[d * O + o];
          grad += ridge * this.weights[d * O + o];
          this.weights[d * O + o] -= lr * grad;
        }
      }
    }
    this.trained = true;
  }

  /** Run readout on reservoir state */
  run(state: Float64Array): { output: Float64Array; confidence: number } {
    if (!this.trained || !this.weights) {
      return { output: new Float64Array(this.outputDim), confidence: 0 };
    }
    const output = new Float64Array(this.outputDim);
    for (let o = 0; o < this.outputDim; o++) {
      let sum = this.bias ? this.bias[o] : 0;
      for (let d = 0; d < this.inputDim; d++) {
        sum += state[d] * this.weights[d * this.outputDim + o];
      }
      output[o] = Math.tanh(sum);
    }
    let mag = 0;
    for (let i = 0; i < output.length; i++) mag += output[i] ** 2;
    return { output, confidence: Math.min(1, Math.sqrt(mag / this.outputDim)) };
  }

  /** Set weights directly (for online learning) */
  setWeights(weights: Float64Array, inputDim: number): void {
    this.weights = weights;
    this.inputDim = inputDim;
    this.bias = new Float64Array(this.outputDim);
    this.trained = true;
  }

  getWeights(): Float64Array | null { return this.weights; }
  isTrained(): boolean { return this.trained; }
}

/** AAR Relation — Agent-Arena-Relation (Self) */
export interface AARState {
  agentOutput: Float64Array;
  arenaState: Float64Array;
  coherence: number;
  energy: number;
  tick: number;
}

export class AARRelation extends EventEmitter {
  private reservoir: EchoReservoir;
  private readout: CognitiveReadout;
  private coherenceHistory: number[] = [];

  constructor(reservoir: EchoReservoir, readout: CognitiveReadout) {
    super();
    this.reservoir = reservoir;
    this.readout = readout;
  }

  /** Full AAR cycle: Input → Arena → Agent → Relation */
  process(input: Float64Array | number[]): AARState {
    const arenaState = this.reservoir.step(input);
    const { output: agentOutput } = this.readout.run(arenaState);

    const coherence = this.computeCoherence(agentOutput, arenaState);
    this.coherenceHistory.push(coherence);
    if (this.coherenceHistory.length > 100) this.coherenceHistory.shift();

    let energy = 0;
    for (let i = 0; i < arenaState.length; i++) energy += arenaState[i] ** 2;
    energy = Math.sqrt(energy / arenaState.length);

    const state: AARState = {
      agentOutput, arenaState, coherence, energy,
      tick: this.reservoir.getTick(),
    };
    this.emit('cycle_complete', state);
    return state;
  }

  private computeCoherence(agent: Float64Array, arena: Float64Array): number {
    const dim = Math.min(agent.length, arena.length);
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < dim; i++) {
      dot += agent[i] * arena[i];
      magA += agent[i] ** 2;
      magB += arena[i] ** 2;
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom > 0 ? (dot / denom + 1) / 2 : 0.5;
  }

  getAverageCoherence(): number {
    if (this.coherenceHistory.length === 0) return 0.5;
    return this.coherenceHistory.reduce((a, b) => a + b, 0) / this.coherenceHistory.length;
  }

  getReservoir(): EchoReservoir { return this.reservoir; }
  getReadout(): CognitiveReadout { return this.readout; }
}

// ============================================================
// Identity Mesh (Persistent Self-Model)
// ============================================================

export enum OntogeneticStage {
  EMBRYONIC = 'embryonic',
  INFANT = 'infant',
  CHILD = 'child',
  ADOLESCENT = 'adolescent',
  ADULT = 'adult',
  ELDER = 'elder',
}

export const STAGE_THRESHOLDS: Record<OntogeneticStage, number> = {
  [OntogeneticStage.EMBRYONIC]: 0,
  [OntogeneticStage.INFANT]: 10,
  [OntogeneticStage.CHILD]: 50,
  [OntogeneticStage.ADOLESCENT]: 200,
  [OntogeneticStage.ADULT]: 1000,
  [OntogeneticStage.ELDER]: 5000,
};

export interface IdentityMeshState {
  stage: OntogeneticStage;
  totalInteractions: number;
  energy: number;
  valence: number;
  arousal: number;
  cognitiveMode: string;
  knownConcepts: string[];
  personalityTraits: Record<string, number>;
  lastUpdated: number;
}

export class IdentityMesh extends EventEmitter {
  private state: IdentityMeshState;

  constructor() {
    super();
    this.state = {
      stage: OntogeneticStage.EMBRYONIC,
      totalInteractions: 0,
      energy: 0.5,
      valence: 0,
      arousal: 0.5,
      cognitiveMode: 'exploratory',
      knownConcepts: [],
      personalityTraits: {
        openness: 0.8,
        conscientiousness: 0.7,
        extraversion: 0.5,
        agreeableness: 0.6,
        neuroticism: 0.3,
      },
      lastUpdated: Date.now(),
    };
  }

  /** Update identity from an interaction */
  updateFromInteraction(aarState: AARState, responseQuality: number): void {
    this.state.totalInteractions++;
    this.state.energy = aarState.energy;
    this.state.valence = 0.9 * this.state.valence + 0.1 * (responseQuality * 2 - 1);
    this.state.arousal = 0.9 * this.state.arousal + 0.1 * aarState.energy;
    this.state.cognitiveMode =
      aarState.coherence > 0.7 ? 'focused' :
      aarState.coherence > 0.4 ? 'exploratory' : 'creative';
    this.state.lastUpdated = Date.now();
    this.checkStageProgression();
    this.emit('updated', this.state);
  }

  private checkStageProgression(): void {
    const stages = Object.entries(STAGE_THRESHOLDS) as [OntogeneticStage, number][];
    for (let i = stages.length - 1; i >= 0; i--) {
      if (this.state.totalInteractions >= stages[i][1]) {
        if (this.state.stage !== stages[i][0]) {
          const prev = this.state.stage;
          this.state.stage = stages[i][0];
          this.emit('stage_change', { from: prev, to: this.state.stage });
        }
        break;
      }
    }
  }

  getState(): IdentityMeshState { return { ...this.state }; }
  getStage(): OntogeneticStage { return this.state.stage; }
}

// ============================================================
// Core Self Engine
// ============================================================

export interface CoreSelfConfig {
  lucy: Partial<LucyDriverConfig>;
  reservoir: Partial<ESNConfig>;
  readoutDim: number;
  embeddingDim: number;
  enableReservoirModulation: boolean;
  enableApiAugmentation: boolean;
  apiLlmBaseUrl?: string;
  apiLlmModel?: string;
  apiLlmApiKey?: string;
  maxConversationHistory: number;
}

export interface CoreSelfResponse {
  content: string;
  source: 'core-self' | 'api-augmented' | 'fallback';
  aarState: { coherence: number; energy: number; tick: number };
  identity: {
    stage: OntogeneticStage;
    energy: number;
    valence: number;
    arousal: number;
    cognitiveMode: string;
  };
  metrics: { durationMs: number; tokensGenerated: number; tokensPerSecond: number };
}

const DEFAULT_CORE_SELF_CONFIG: CoreSelfConfig = {
  lucy: {},
  reservoir: { units: 256, inputDim: 128 },
  readoutDim: 64,
  embeddingDim: 128,
  enableReservoirModulation: true,
  enableApiAugmentation: true,
  maxConversationHistory: 20,
};

export class CoreSelfEngine extends EventEmitter {
  private config: CoreSelfConfig;
  private lucy: LucyInferenceDriver;
  private reservoir: EchoReservoir;
  private readout: CognitiveReadout;
  private aar: AARRelation;
  private identity: IdentityMesh;
  private conversationHistory: ChatMessage[] = [];
  private totalInteractions: number = 0;
  private running: boolean = false;

  constructor(config: Partial<CoreSelfConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CORE_SELF_CONFIG, ...config };

    this.lucy = new LucyInferenceDriver(this.config.lucy);
    this.reservoir = new EchoReservoir({
      ...this.config.reservoir,
      inputDim: this.config.embeddingDim,
    });
    this.readout = new CognitiveReadout(this.config.readoutDim);
    this.aar = new AARRelation(this.reservoir, this.readout);
    this.identity = new IdentityMesh();

    // Wire AAR events
    this.aar.on('cycle_complete', (state: AARState) => {
      this.emit('aar_cycle', state);
    });

    this.identity.on('stage_change', (change) => {
      this.emit('stage_change', change);
    });
  }

  async start(): Promise<void> {
    await this.lucy.start();
    this.running = true;
    this.emit('started', {
      lucyHealthy: this.lucy.isHealthy(),
      reservoirUnits: this.reservoir.getUnits(),
    });
  }

  async stop(): Promise<void> {
    await this.lucy.stop();
    this.running = false;
    this.emit('stopped');
  }

  /**
   * Process a user message through the full cognitive pipeline:
   *   1. Embed input → reservoir step (Arena)
   *   2. Reservoir state → readout (Agent)
   *   3. AAR state → modulate system prompt → Lucy inference
   *   4. Update identity mesh
   *   5. Return response with cognitive metadata
   */
  async processMessage(userMessage: string, context?: string): Promise<CoreSelfResponse> {
    const startTime = Date.now();
    this.totalInteractions++;

    // Step 1: Embed input and step reservoir
    const embedding = await this.textToEmbedding(userMessage);
    const aarState = this.aar.process(embedding);

    // Step 2: Build modulated system prompt
    const identityState = this.identity.getState();
    const systemPrompt = this.config.enableReservoirModulation
      ? modulateSystemPrompt(this.config.lucy.systemPrompt || '', {
          coherence: aarState.coherence,
          energy: aarState.energy,
          tick: aarState.tick,
          phase: this.getEchobeatPhase(aarState.tick),
          valence: identityState.valence,
          arousal: identityState.arousal,
          autognosisLevel: this.computeAutognosisLevel(),
        })
      : this.config.lucy.systemPrompt || '';

    // Step 3: Build messages
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory.slice(-this.config.maxConversationHistory),
      { role: 'user', content: context ? `[Context: ${context}]\n${userMessage}` : userMessage },
    ];

    // Step 4: Inference (Lucy → API fallback → reservoir fallback)
    let result: InferenceResult;
    let source: CoreSelfResponse['source'] = 'core-self';

    if (this.lucy.isHealthy()) {
      result = await this.lucy.chatCompletion(messages);
    } else if (this.config.enableApiAugmentation && this.config.apiLlmBaseUrl) {
      result = await this.apiInference(messages);
      source = 'api-augmented';
    } else {
      result = this.reservoirFallback(userMessage, aarState);
      source = 'fallback';
    }

    // Step 5: Update conversation history
    this.conversationHistory.push(
      { role: 'user', content: userMessage },
      { role: 'assistant', content: result.content },
    );
    if (this.conversationHistory.length > this.config.maxConversationHistory * 2) {
      this.conversationHistory = this.conversationHistory.slice(-this.config.maxConversationHistory);
    }

    // Step 6: Update identity mesh
    const quality = source === 'core-self' ? 0.8 : source === 'api-augmented' ? 0.6 : 0.3;
    this.identity.updateFromInteraction(aarState, quality);

    const response: CoreSelfResponse = {
      content: result.content,
      source,
      aarState: {
        coherence: aarState.coherence,
        energy: aarState.energy,
        tick: aarState.tick,
      },
      identity: {
        stage: this.identity.getStage(),
        energy: identityState.energy,
        valence: identityState.valence,
        arousal: identityState.arousal,
        cognitiveMode: identityState.cognitiveMode,
      },
      metrics: {
        durationMs: Date.now() - startTime,
        tokensGenerated: result.tokensGenerated,
        tokensPerSecond: result.tokensPerSecond,
      },
    };

    this.emit('message_processed', response);
    return response;
  }

  /**
   * Self-reflection — process without external input.
   * The reservoir's current state drives the reflection.
   */
  async reflect(topic?: string): Promise<CoreSelfResponse> {
    const prompt = topic
      ? `Reflect on: ${topic}. Consider your current cognitive state and what insights emerge.`
      : 'Reflect on your current state. What patterns do you notice? What has changed?';
    return this.processMessage(prompt, 'self-reflection');
  }

  // ─── Accessors ─────────────────────────────────────────────

  getReservoir(): EchoReservoir { return this.reservoir; }
  getReadout(): CognitiveReadout { return this.readout; }
  getAAR(): AARRelation { return this.aar; }
  getIdentity(): IdentityMesh { return this.identity; }
  getLucy(): LucyInferenceDriver { return this.lucy; }
  isRunning(): boolean { return this.running; }

  // ─── Private Helpers ───────────────────────────────────────

  private async textToEmbedding(text: string): Promise<Float64Array> {
    const dim = this.config.embeddingDim;
    try {
      const embedding = await this.lucy.generateEmbedding(text);
      const result = new Float64Array(dim);
      for (let i = 0; i < Math.min(dim, embedding.length); i++) {
        result[i] = embedding[i];
      }
      return result;
    } catch {
      // Fallback: hash-based embedding
      const result = new Float64Array(dim);
      for (let i = 0; i < text.length; i++) {
        result[i % dim] += (text.charCodeAt(i) - 96) / 26;
      }
      let norm = 0;
      for (let i = 0; i < dim; i++) norm += result[i] ** 2;
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < dim; i++) result[i] /= norm;
      return result;
    }
  }

  private async apiInference(messages: ChatMessage[]): Promise<InferenceResult> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.config.apiLlmBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiLlmApiKey ? { Authorization: `Bearer ${this.config.apiLlmApiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.config.apiLlmModel || 'gpt-4',
          messages,
          max_tokens: 512,
          temperature: 0.7,
        }),
      });
      const data = await response.json() as any;
      return {
        content: data.choices?.[0]?.message?.content || '',
        tokensGenerated: data.usage?.completion_tokens || 0,
        tokensPrompt: data.usage?.prompt_tokens || 0,
        durationMs: Date.now() - startTime,
        tokensPerSecond: 0,
        finishReason: 'stop',
      };
    } catch {
      return this.reservoirFallback('', null);
    }
  }

  private reservoirFallback(input: string, aarState: AARState | null): InferenceResult {
    const state = aarState || this.aar.process(new Float64Array(this.config.embeddingDim));
    const coherence = state.coherence;
    const content = coherence > 0.5
      ? `[Reservoir mode] Processing "${input.slice(0, 50)}..." with coherence ${coherence.toFixed(3)}.`
      : `[Reservoir mode] Low coherence (${coherence.toFixed(3)}). Consolidating state...`;
    return {
      content,
      tokensGenerated: 0,
      tokensPrompt: 0,
      durationMs: 0,
      tokensPerSecond: 0,
      finishReason: 'stop',
    };
  }

  private getEchobeatPhase(tick: number): string {
    const phases = ['perceive', 'perceive', 'perceive', 'perceive',
                    'reason', 'reason', 'reason', 'reason',
                    'act', 'act', 'act', 'act'];
    return phases[(tick - 1) % 12] || 'perceive';
  }

  private computeAutognosisLevel(): number {
    let level = 0;
    if (this.totalInteractions > 0) level = 1;
    if (this.totalInteractions > 10) level = 2;
    if (this.aar.getAverageCoherence() > 0.5) level = 3;
    if (this.identity.getStage() !== OntogeneticStage.EMBRYONIC) level = 4;
    return level;
  }
}
