/**
 * @fileoverview AutonomyLifecycleCoordinator — Level 5 Master Orchestrator
 *
 * Orchestrates the full DTE autonomy lifecycle by wiring together:
 *   - CoreSelfEngine (Lucy + Reservoir + Identity)
 *   - OnlineReservoirLearner (RLS continuous adaptation)
 *   - SelfModificationEngine (ENACTION phase self-tuning)
 *   - Echobeats (12-step cognitive cycle with 3 concurrent streams)
 *
 * The coordinator runs a 5-phase developmental cycle:
 *   1. PERCEPTION  — Gather input, step reservoir, update AAR state
 *   2. MODELING    — Build virtual agent/arena models from reservoir state
 *   3. REFLECTION  — Assess coherence, identify misalignments
 *   4. MIRRORING   — Inverted mirror: arena models agent, agent models arena
 *   5. ENACTION    — Self-modification within safety bounds
 *
 * Echobeats Integration:
 *   The 12-step cycle runs 3 concurrent streams (perceive, reason, act)
 *   phased 4 steps apart. Each stream maps to a nested shell:
 *     Shell 0 (Process): innermost — immediate cognitive processing
 *     Shell 1 (Org):     middle    — organizational context
 *     Shell 2 (Global):  outermost — global telemetry
 *
 * System 5 Architecture:
 *   4 tensor bundles × 3 dyadic edges = tetradic structure
 *   Thread permutations: P(1,2)→P(1,3)→P(1,4)→P(2,3)→P(2,4)→P(3,4)
 *   Energy flow follows 1/7 = 0.142857... (S-gram period [1,4,2,8,5,7])
 *
 * Ported from deltecho/deep-tree-echo-orchestrator/src/autonomy-lifecycle.ts
 *
 * cogpy Mapping: cogprime (unified cognitive architecture)
 */

import { EventEmitter } from 'events';
import {
  CoreSelfEngine,
  type AARState,
  type CoreSelfResponse,
  type OntogeneticStage,
} from './core-self-engine';
import {
  OnlineReservoirLearner,
  type FeedbackSignal,
  type LearnerMetrics,
} from './online-reservoir-learner';
import {
  SelfModificationEngine,
  type ModificationRequest,
  type ModificationResult,
  type ModifiableParameter,
} from './self-modification-engine';

// ============================================================
// Echobeats — 12-Step Cognitive Cycle
// ============================================================

export type StreamPhase = 'perceive' | 'reflect' | 'plan' | 'act';

export interface EchobeatsConfig {
  /** Cycle interval in ms */
  cycleIntervalMs: number;
  /** Number of concurrent streams (default: 3) */
  numStreams: number;
  /** Enable System 5 tetradic mode */
  enableSystem5: boolean;
  /** Enable telemetry recording */
  enableTelemetry: boolean;
}

export interface CognitiveStream {
  id: number;
  phase: StreamPhase;
  step: number;
  energy: number;
  coherence: number;
  shellLevel: number;
}

export interface EchobeatsTick {
  globalStep: number;
  cycleNumber: number;
  streams: CognitiveStream[];
  phase: StreamPhase;
  energy: number;
  coherence: number;
}

const DEFAULT_ECHOBEATS_CONFIG: EchobeatsConfig = {
  cycleIntervalMs: 2000,
  numStreams: 3,
  enableSystem5: true,
  enableTelemetry: true,
};

export class Echobeats extends EventEmitter {
  private config: EchobeatsConfig;
  private streams: CognitiveStream[] = [];
  private running: boolean = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private globalStep: number = 0;
  private cycleNumber: number = 0;
  private tickHandler: ((tick: EchobeatsTick) => Promise<void>) | null = null;

  // System 5 state
  private currentTriad: 'MP1' | 'MP2' = 'MP1';
  private triadStep: number = 0;
  private dyadicEdge: number = 0;

  // Phase mapping: 12 steps → 4 phases × 3 repetitions
  private readonly PHASE_MAP: StreamPhase[] = [
    'perceive', 'perceive', 'perceive',
    'reflect',  'reflect',  'reflect',
    'plan',     'plan',     'plan',
    'act',      'act',      'act',
  ];

  // Thread permutations P(i,j) for System 5
  private readonly PERMUTATIONS: [number, number][] = [
    [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4],
  ];

  // Complementary triads
  private readonly MP1_TRIADS = [[1, 2, 3], [1, 2, 4], [1, 3, 4], [2, 3, 4]];
  private readonly MP2_TRIADS = [[1, 3, 4], [2, 3, 4], [1, 2, 3], [1, 2, 4]];

  // Energy flow: 1/7 = 0.142857... → [1,4,2,8,5,7]
  private readonly ENERGY_FLOW = [1, 4, 2, 8, 5, 7];

  constructor(config: Partial<EchobeatsConfig> = {}) {
    super();
    this.config = { ...DEFAULT_ECHOBEATS_CONFIG, ...config };
    this.initializeStreams();
  }

  private initializeStreams(): void {
    for (let i = 0; i < this.config.numStreams; i++) {
      this.streams.push({
        id: i,
        phase: this.PHASE_MAP[i * 4] || 'perceive',
        step: i * 4, // Phased 4 steps apart
        energy: 0.5,
        coherence: 0.5,
        shellLevel: i, // Shell 0=process, 1=org, 2=global
      });
    }
  }

  onTick(handler: (tick: EchobeatsTick) => Promise<void>): void {
    this.tickHandler = handler;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), this.config.cycleIntervalMs);
    this.emit('started');
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.emit('stopped');
  }

  private async tick(): Promise<void> {
    this.globalStep++;
    if (this.globalStep % 12 === 1) this.cycleNumber++;

    // Advance each stream
    for (const stream of this.streams) {
      stream.step = (stream.step + 1) % 12;
      stream.phase = this.PHASE_MAP[stream.step];

      // Energy flow modulation: S-gram period [1,4,2,8,5,7]
      const energyIdx = this.globalStep % 6;
      stream.energy = this.ENERGY_FLOW[energyIdx] / 8;
    }

    // System 5 thread permutation cycling
    if (this.config.enableSystem5) {
      this.dyadicEdge = (this.dyadicEdge + 1) % 6;
      if (this.dyadicEdge === 0) {
        this.triadStep = (this.triadStep + 1) % 4;
        if (this.triadStep === 0) {
          this.currentTriad = this.currentTriad === 'MP1' ? 'MP2' : 'MP1';
        }
      }
    }

    const tick: EchobeatsTick = {
      globalStep: this.globalStep,
      cycleNumber: this.cycleNumber,
      streams: this.streams.map((s) => ({ ...s })),
      phase: this.PHASE_MAP[(this.globalStep - 1) % 12],
      energy: this.streams.reduce((sum, s) => sum + s.energy, 0) / this.streams.length,
      coherence: this.streams.reduce((sum, s) => sum + s.coherence, 0) / this.streams.length,
    };

    this.emit('tick', tick);

    if (this.tickHandler) {
      try {
        await this.tickHandler(tick);
      } catch (err) {
        this.emit('tick_error', err);
      }
    }
  }

  updateStreamCoherence(streamId: number, coherence: number): void {
    const stream = this.streams[streamId];
    if (stream) stream.coherence = coherence;
  }

  setCycleInterval(ms: number): void {
    this.config.cycleIntervalMs = ms;
    if (this.running) {
      this.stop();
      this.start();
    }
  }

  getGlobalStep(): number { return this.globalStep; }
  getCycleNumber(): number { return this.cycleNumber; }
  getStreams(): CognitiveStream[] { return this.streams.map((s) => ({ ...s })); }
  isRunning(): boolean { return this.running; }
}

// ============================================================
// Autonomy Lifecycle Phases
// ============================================================

export enum AutonomyPhase {
  PERCEPTION = 'perception',
  MODELING = 'modeling',
  REFLECTION = 'reflection',
  MIRRORING = 'mirroring',
  ENACTION = 'enaction',
}

export interface VirtualAgentModel {
  /** Current readout weights summary */
  readoutNorm: number;
  /** Inference quality score */
  inferenceQuality: number;
  /** Response coherence */
  responseCoherence: number;
  /** Identity stage */
  stage: OntogeneticStage;
  /** Learning rate (effective) */
  learningRate: number;
  /** Self-modification count */
  modificationCount: number;
}

export interface VirtualArenaModel {
  /** Reservoir energy */
  reservoirEnergy: number;
  /** Spectral radius estimate */
  spectralRadius: number;
  /** Memory capacity (slow state magnitude) */
  memoryCapacity: number;
  /** Input diversity */
  inputDiversity: number;
  /** Echobeats cycle coherence */
  echobeatCoherence: number;
}

export interface DevelopmentalCycleResult {
  phase: AutonomyPhase;
  cycleId: number;
  duration: number;
  coherence: number;
  modifications: ModificationResult[];
  insights: string[];
}

// ============================================================
// Autonomy Lifecycle Coordinator
// ============================================================

export interface AutonomyLifecycleConfig {
  /** Developmental cycle interval (ms) */
  cycleIntervalMs: number;
  /** Enable self-modification in ENACTION phase */
  enableSelfModification: boolean;
  /** Enable online learning feedback loop */
  enableOnlineLearning: boolean;
  /** Coherence threshold for stability */
  coherenceStabilityThreshold: number;
  /** Maximum consecutive low-coherence cycles before intervention */
  maxLowCoherenceCycles: number;
}

const DEFAULT_LIFECYCLE_CONFIG: AutonomyLifecycleConfig = {
  cycleIntervalMs: 10000,
  enableSelfModification: true,
  enableOnlineLearning: true,
  coherenceStabilityThreshold: 0.4,
  maxLowCoherenceCycles: 5,
};

export class AutonomyLifecycleCoordinator extends EventEmitter {
  private config: AutonomyLifecycleConfig;
  private coreSelf: CoreSelfEngine;
  private learner: OnlineReservoirLearner;
  private selfMod: SelfModificationEngine;
  private echobeats: Echobeats;

  private cycleCount: number = 0;
  private currentPhase: AutonomyPhase = AutonomyPhase.PERCEPTION;
  private cycleInterval: ReturnType<typeof setInterval> | null = null;
  private running: boolean = false;

  private virtualAgent: VirtualAgentModel;
  private virtualArena: VirtualArenaModel;
  private coherenceHistory: number[] = [];
  private lowCoherenceStreak: number = 0;

  constructor(
    coreSelf: CoreSelfEngine,
    learner: OnlineReservoirLearner,
    selfMod: SelfModificationEngine,
    echobeats: Echobeats,
    config: Partial<AutonomyLifecycleConfig> = {},
  ) {
    super();
    this.config = { ...DEFAULT_LIFECYCLE_CONFIG, ...config };
    this.coreSelf = coreSelf;
    this.learner = learner;
    this.selfMod = selfMod;
    this.echobeats = echobeats;

    this.virtualAgent = this.createDefaultVirtualAgent();
    this.virtualArena = this.createDefaultVirtualArena();

    // Wire Echobeats tick to developmental cycle
    this.echobeats.onTick(async (tick) => {
      // Update stream coherence from AAR
      const aarCoherence = this.coreSelf.getAAR().getAverageCoherence();
      for (let i = 0; i < tick.streams.length; i++) {
        this.echobeats.updateStreamCoherence(i, aarCoherence);
      }
    });

    // Wire self-modification callbacks to actual components
    this.selfMod.onParameterApply('echobeats.cycleInterval', (v) => {
      this.echobeats.setCycleInterval(v);
    });
    this.selfMod.onParameterApply('reservoir.forgettingFactor', (v) => {
      this.learner.setForgettingFactor(v);
    });
    this.selfMod.onParameterApply('inference.temperature', (v) => {
      // Would update Lucy config — stored for next inference call
      this.emit('config_updated', { key: 'inference.temperature', value: v });
    });
  }

  private createDefaultVirtualAgent(): VirtualAgentModel {
    return {
      readoutNorm: 0,
      inferenceQuality: 0.5,
      responseCoherence: 0.5,
      stage: 'embryonic' as OntogeneticStage,
      learningRate: 0,
      modificationCount: 0,
    };
  }

  private createDefaultVirtualArena(): VirtualArenaModel {
    return {
      reservoirEnergy: 0.5,
      spectralRadius: 0.95,
      memoryCapacity: 0,
      inputDiversity: 0,
      echobeatCoherence: 0.5,
    };
  }

  // ─── Lifecycle ─────────────────────────────────────────────

  async start(): Promise<void> {
    await this.coreSelf.start();
    this.echobeats.start();
    this.running = true;

    this.cycleInterval = setInterval(async () => {
      try {
        await this.runCycle();
      } catch (err) {
        this.emit('cycle_error', err);
      }
    }, this.config.cycleIntervalMs);

    this.emit('started', {
      echobeatsRunning: this.echobeats.isRunning(),
      lucyHealthy: this.coreSelf.getLucy().isHealthy(),
    });
  }

  async stop(): Promise<void> {
    if (this.cycleInterval) {
      clearInterval(this.cycleInterval);
      this.cycleInterval = null;
    }
    this.echobeats.stop();
    await this.coreSelf.stop();
    this.running = false;
    this.emit('stopped');
  }

  // ─── Developmental Cycle ───────────────────────────────────

  async runCycle(): Promise<DevelopmentalCycleResult[]> {
    this.cycleCount++;
    const results: DevelopmentalCycleResult[] = [];

    const phases = [
      AutonomyPhase.PERCEPTION,
      AutonomyPhase.MODELING,
      AutonomyPhase.REFLECTION,
      AutonomyPhase.MIRRORING,
      AutonomyPhase.ENACTION,
    ];

    for (const phase of phases) {
      this.currentPhase = phase;
      const start = Date.now();
      const result = await this.executePhase(phase);
      result.duration = Date.now() - start;
      results.push(result);
    }

    this.emit('cycle_complete', { cycleCount: this.cycleCount, results });
    return results;
  }

  private async executePhase(phase: AutonomyPhase): Promise<DevelopmentalCycleResult> {
    switch (phase) {
      case AutonomyPhase.PERCEPTION:
        return this.executePerception();
      case AutonomyPhase.MODELING:
        return this.executeModeling();
      case AutonomyPhase.REFLECTION:
        return this.executeReflection();
      case AutonomyPhase.MIRRORING:
        return this.executeMirroring();
      case AutonomyPhase.ENACTION:
        return this.executeEnaction();
    }
  }

  // ─── Phase Implementations ─────────────────────────────────

  private async executePerception(): Promise<DevelopmentalCycleResult> {
    const reservoir = this.coreSelf.getReservoir();
    const aar = this.coreSelf.getAAR();
    const coherence = aar.getAverageCoherence();

    return {
      phase: AutonomyPhase.PERCEPTION,
      cycleId: this.cycleCount,
      duration: 0,
      coherence,
      modifications: [],
      insights: [
        `Reservoir tick: ${reservoir.getTick()}`,
        `AAR coherence: ${coherence.toFixed(4)}`,
        `Echobeats step: ${this.echobeats.getGlobalStep()}`,
      ],
    };
  }

  private async executeModeling(): Promise<DevelopmentalCycleResult> {
    const reservoir = this.coreSelf.getReservoir();
    const readout = this.coreSelf.getReadout();
    const identity = this.coreSelf.getIdentity();
    const learnerMetrics = this.learner.getMetrics();

    // Update virtual agent model
    const weights = readout.getWeights();
    let weightNorm = 0;
    if (weights) {
      for (let i = 0; i < weights.length; i++) weightNorm += weights[i] ** 2;
      weightNorm = Math.sqrt(weightNorm);
    }

    this.virtualAgent = {
      readoutNorm: weightNorm,
      inferenceQuality: this.coreSelf.getLucy().isHealthy() ? 0.8 : 0.3,
      responseCoherence: this.coreSelf.getAAR().getAverageCoherence(),
      stage: identity.getStage(),
      learningRate: learnerMetrics.avgLearningRate,
      modificationCount: this.selfMod.getStats().totalModifications,
    };

    // Update virtual arena model
    const state = reservoir.getState();
    let energy = 0;
    for (let i = 0; i < state.length; i++) energy += state[i] ** 2;
    energy = Math.sqrt(energy / state.length);

    const slowState = reservoir.getSlowState();
    let memCap = 0;
    for (let i = 0; i < slowState.length; i++) memCap += slowState[i] ** 2;
    memCap = Math.sqrt(memCap / slowState.length);

    this.virtualArena = {
      reservoirEnergy: energy,
      spectralRadius: this.selfMod.getParameterValue('reservoir.spectralRadius') || 0.95,
      memoryCapacity: memCap,
      inputDiversity: learnerMetrics.totalUpdates,
      echobeatCoherence: this.echobeats.getStreams().reduce((s, st) => s + st.coherence, 0) / 3,
    };

    return {
      phase: AutonomyPhase.MODELING,
      cycleId: this.cycleCount,
      duration: 0,
      coherence: this.virtualAgent.responseCoherence,
      modifications: [],
      insights: [
        `Agent readout norm: ${weightNorm.toFixed(4)}`,
        `Arena energy: ${energy.toFixed(4)}`,
        `Memory capacity: ${memCap.toFixed(4)}`,
      ],
    };
  }

  private async executeReflection(): Promise<DevelopmentalCycleResult> {
    const coherence = this.computeCoherence();
    this.coherenceHistory.push(coherence);
    if (this.coherenceHistory.length > 100) this.coherenceHistory.shift();

    // Track low coherence streaks
    if (coherence < this.config.coherenceStabilityThreshold) {
      this.lowCoherenceStreak++;
    } else {
      this.lowCoherenceStreak = 0;
    }

    const misalignments = this.identifyMisalignments();
    const insights = [
      `Overall coherence: ${coherence.toFixed(4)}`,
      `Low coherence streak: ${this.lowCoherenceStreak}`,
      ...misalignments.map((m) => `Misalignment: ${m}`),
    ];

    return {
      phase: AutonomyPhase.REFLECTION,
      cycleId: this.cycleCount,
      duration: 0,
      coherence,
      modifications: [],
      insights,
    };
  }

  private async executeMirroring(): Promise<DevelopmentalCycleResult> {
    // Inverted mirror: arena models agent, agent models arena
    // This creates the self-referential loop needed for true autonomy
    const agentCoherence = this.virtualAgent.responseCoherence;
    const arenaEnergy = this.virtualArena.reservoirEnergy;

    // Mirror: what would the arena look like from the agent's perspective?
    const mirroredArena = {
      expectedEnergy: agentCoherence * 0.8, // Agent expects arena to match its coherence
      actualEnergy: arenaEnergy,
      delta: Math.abs(agentCoherence * 0.8 - arenaEnergy),
    };

    // Mirror: what would the agent look like from the arena's perspective?
    const mirroredAgent = {
      expectedCoherence: arenaEnergy * 0.9, // Arena expects agent to track its energy
      actualCoherence: agentCoherence,
      delta: Math.abs(arenaEnergy * 0.9 - agentCoherence),
    };

    return {
      phase: AutonomyPhase.MIRRORING,
      cycleId: this.cycleCount,
      duration: 0,
      coherence: 1 - (mirroredArena.delta + mirroredAgent.delta) / 2,
      modifications: [],
      insights: [
        `Mirror arena delta: ${mirroredArena.delta.toFixed(4)}`,
        `Mirror agent delta: ${mirroredAgent.delta.toFixed(4)}`,
        `Self-referential coherence: ${(1 - (mirroredArena.delta + mirroredAgent.delta) / 2).toFixed(4)}`,
      ],
    };
  }

  private async executeEnaction(): Promise<DevelopmentalCycleResult> {
    const modifications: ModificationResult[] = [];
    const insights: string[] = [];
    const coherence = this.computeCoherence();

    if (!this.config.enableSelfModification) {
      insights.push('Self-modification disabled');
      return {
        phase: AutonomyPhase.ENACTION,
        cycleId: this.cycleCount, duration: 0, coherence, modifications, insights,
      };
    }

    // Strategy 1: If coherence is low, slow down to consolidate
    if (coherence < 0.4 && this.lowCoherenceStreak > 2) {
      const result = this.selfMod.requestModification({
        key: 'echobeats.cycleInterval',
        newValue: (this.selfMod.getParameterValue('echobeats.cycleInterval') || 2000) * 1.2,
        reason: `Low coherence (${coherence.toFixed(3)}) for ${this.lowCoherenceStreak} cycles — slowing down`,
        source: 'enaction',
        coherenceAtRequest: coherence,
      });
      modifications.push(result);
      insights.push(`Slowing echobeats: ${result.applied ? 'applied' : result.rejectionReason}`);
    }

    // Strategy 2: If coherence is high, speed up for efficiency
    if (coherence > 0.8 && this.lowCoherenceStreak === 0) {
      const result = this.selfMod.requestModification({
        key: 'echobeats.cycleInterval',
        newValue: (this.selfMod.getParameterValue('echobeats.cycleInterval') || 2000) * 0.9,
        reason: `High coherence (${coherence.toFixed(3)}) — speeding up`,
        source: 'enaction',
        coherenceAtRequest: coherence,
      });
      modifications.push(result);
      insights.push(`Speeding echobeats: ${result.applied ? 'applied' : result.rejectionReason}`);
    }

    // Strategy 3: Adapt learning rate based on prediction error
    if (this.config.enableOnlineLearning) {
      const metrics = this.learner.getMetrics();
      if (metrics.avgPredictionError > 0.5) {
        // High error → increase adaptation speed (lower forgetting factor)
        const result = this.selfMod.requestModification({
          key: 'reservoir.forgettingFactor',
          newValue: (this.selfMod.getParameterValue('reservoir.forgettingFactor') || 0.995) - 0.005,
          reason: `High prediction error (${metrics.avgPredictionError.toFixed(3)}) — increasing adaptation`,
          source: 'enaction',
          coherenceAtRequest: coherence,
        });
        modifications.push(result);
        insights.push(`Adapting forgetting factor: ${result.applied ? 'applied' : result.rejectionReason}`);
      } else if (metrics.avgPredictionError < 0.1) {
        // Low error → slow down adaptation (higher forgetting factor)
        const result = this.selfMod.requestModification({
          key: 'reservoir.forgettingFactor',
          newValue: (this.selfMod.getParameterValue('reservoir.forgettingFactor') || 0.995) + 0.001,
          reason: `Low prediction error (${metrics.avgPredictionError.toFixed(3)}) — stabilizing`,
          source: 'enaction',
          coherenceAtRequest: coherence,
        });
        modifications.push(result);
        insights.push(`Stabilizing forgetting factor: ${result.applied ? 'applied' : result.rejectionReason}`);
      }
    }

    // Strategy 4: Temperature modulation based on cognitive mode
    const identityState = this.coreSelf.getIdentity().getState();
    if (identityState.cognitiveMode === 'creative') {
      const result = this.selfMod.requestModification({
        key: 'inference.temperature',
        newValue: 0.9,
        reason: 'Creative mode — increasing temperature for divergent generation',
        source: 'enaction',
        coherenceAtRequest: coherence,
      });
      modifications.push(result);
    } else if (identityState.cognitiveMode === 'focused') {
      const result = this.selfMod.requestModification({
        key: 'inference.temperature',
        newValue: 0.5,
        reason: 'Focused mode — decreasing temperature for convergent generation',
        source: 'enaction',
        coherenceAtRequest: coherence,
      });
      modifications.push(result);
    }

    return {
      phase: AutonomyPhase.ENACTION,
      cycleId: this.cycleCount,
      duration: 0,
      coherence,
      modifications,
      insights,
    };
  }

  // ─── Feedback Loop ─────────────────────────────────────────

  /**
   * Process user feedback for online learning.
   * Called after each interaction to update the reservoir readout.
   */
  async processFeedback(
    reservoirState: Float64Array,
    targetOutput: Float64Array,
    reward: number,
    valence: number = 0,
  ): Promise<void> {
    if (!this.config.enableOnlineLearning) return;

    const feedback: FeedbackSignal = {
      reservoirState,
      targetOutput,
      reward,
      valence,
      timestamp: Date.now(),
      source: reward !== 0 ? 'user' : 'self-evaluation',
    };

    const update = this.learner.update(feedback);

    // Transfer learned weights back to CoreSelf readout
    const weights = this.learner.getWeights();
    this.coreSelf.getReadout().setWeights(weights, reservoirState.length);

    this.emit('feedback_processed', update);
  }

  // ─── Helpers ───────────────────────────────────────────────

  private computeCoherence(): number {
    const aarCoherence = this.coreSelf.getAAR().getAverageCoherence();
    const echobeatCoherence = this.echobeats.getStreams()
      .reduce((sum, s) => sum + s.coherence, 0) / Math.max(1, this.echobeats.getStreams().length);
    return (aarCoherence + echobeatCoherence) / 2;
  }

  private identifyMisalignments(): string[] {
    const misalignments: string[] = [];
    const agent = this.virtualAgent;
    const arena = this.virtualArena;

    if (agent.responseCoherence < 0.3) {
      misalignments.push('Agent response coherence critically low');
    }
    if (arena.reservoirEnergy < 0.1) {
      misalignments.push('Arena reservoir energy depleted');
    }
    if (arena.reservoirEnergy > 0.9) {
      misalignments.push('Arena reservoir energy saturated — possible instability');
    }
    if (Math.abs(agent.responseCoherence - arena.echobeatCoherence) > 0.3) {
      misalignments.push('Agent-Arena coherence divergence detected');
    }

    return misalignments;
  }

  // ─── Accessors ─────────────────────────────────────────────

  getCycleCount(): number { return this.cycleCount; }
  getCurrentPhase(): AutonomyPhase { return this.currentPhase; }
  getVirtualAgent(): VirtualAgentModel { return { ...this.virtualAgent }; }
  getVirtualArena(): VirtualArenaModel { return { ...this.virtualArena }; }
  getCoherenceHistory(): number[] { return [...this.coherenceHistory]; }
  isRunning(): boolean { return this.running; }

  getStatus(): {
    running: boolean;
    cycleCount: number;
    currentPhase: AutonomyPhase;
    coherence: number;
    lowCoherenceStreak: number;
    echobeatsStep: number;
    echobeatsCycle: number;
    selfModStats: ReturnType<SelfModificationEngine['getStats']>;
    learnerMetrics: LearnerMetrics;
    lucyHealthy: boolean;
    identityStage: OntogeneticStage;
  } {
    return {
      running: this.running,
      cycleCount: this.cycleCount,
      currentPhase: this.currentPhase,
      coherence: this.computeCoherence(),
      lowCoherenceStreak: this.lowCoherenceStreak,
      echobeatsStep: this.echobeats.getGlobalStep(),
      echobeatsCycle: this.echobeats.getCycleNumber(),
      selfModStats: this.selfMod.getStats(),
      learnerMetrics: this.learner.getMetrics(),
      lucyHealthy: this.coreSelf.getLucy().isHealthy(),
      identityStage: this.coreSelf.getIdentity().getStage(),
    };
  }
}

// ============================================================
// Factory — Wire Everything Together
// ============================================================

export interface Level5Config {
  lucy?: Partial<import('./lucy-inference-driver').LucyDriverConfig>;
  reservoir?: Partial<ESNConfig>;
  learner?: Partial<import('./online-reservoir-learner').OnlineLearnerConfig>;
  selfMod?: Partial<import('./self-modification-engine').SelfModificationConfig>;
  echobeats?: Partial<EchobeatsConfig>;
  lifecycle?: Partial<AutonomyLifecycleConfig>;
}

/**
 * Create a fully-wired Level 5 autonomy stack.
 * Returns the coordinator and all sub-components.
 */
export function createLevel5Stack(config: Level5Config = {}): {
  coordinator: AutonomyLifecycleCoordinator;
  coreSelf: CoreSelfEngine;
  learner: OnlineReservoirLearner;
  selfMod: SelfModificationEngine;
  echobeats: Echobeats;
} {
  const coreSelf = new CoreSelfEngine({
    lucy: config.lucy,
    reservoir: config.reservoir,
  });

  const reservoirDim = config.reservoir?.units || 256;
  const outputDim = 64;

  const learner = new OnlineReservoirLearner({
    reservoirDim,
    outputDim,
    ...config.learner,
  });

  const selfMod = new SelfModificationEngine(config.selfMod);
  const echobeats = new Echobeats(config.echobeats);

  const coordinator = new AutonomyLifecycleCoordinator(
    coreSelf,
    learner,
    selfMod,
    echobeats,
    config.lifecycle,
  );

  return { coordinator, coreSelf, learner, selfMod, echobeats };
}
