/**
 * @fileoverview SelfModificationEngine — ENACTION Phase Configuration Modification
 *
 * Step 4 of Level 5 (True Autonomy):
 *   Allow the ENACTION phase of the AutonomyLifecycleCoordinator to modify
 *   its own configuration within safety bounds.
 *
 * This engine manages a registry of modifiable parameters with:
 *   - Per-parameter min/max bounds
 *   - Maximum change rate per modification (maxDeltaFraction)
 *   - Rate limiting (max modifications per minute)
 *   - Dead man's switch (coherence collapse → reset to defaults)
 *   - Full modification history for auditability
 *   - Dry-run mode for testing
 *
 * Modifiable Parameter Categories:
 *   timing:     Echobeats cycle interval, perception scan interval
 *   learning:   RLS forgetting factor, spectral radius
 *   inference:  LLM temperature, max tokens, repetition penalty
 *   perception: Input scaling, attention threshold
 *   memory:     Consolidation interval, STI decay rate
 *   goals:      Planning interval, goal priority decay
 *
 * Safety Invariants:
 *   1. No parameter can exceed its min/max bounds
 *   2. No single modification can change a parameter by more than maxDeltaFraction of its range
 *   3. Rate limiting prevents runaway modification loops
 *   4. Dead man's switch activates when coherence drops below threshold
 *   5. All modifications are logged with full context
 *
 * Ported from deltecho/deep-tree-echo-orchestrator/src/self-modification.ts
 *
 * cogpy Mapping: cognu-mach (microkernel cognitive extensions)
 */

import { EventEmitter } from 'events';

// ============================================================
// Types
// ============================================================

export interface ModifiableParameter {
  /** Parameter key path (e.g., 'echobeats.cycleInterval') */
  key: string;
  /** Human-readable description */
  description: string;
  /** Current value */
  currentValue: number;
  /** Default value (for dead man's switch reset) */
  defaultValue: number;
  /** Minimum allowed value */
  min: number;
  /** Maximum allowed value */
  max: number;
  /** Maximum change per modification (as fraction of range) */
  maxDeltaFraction: number;
  /** Category for grouping */
  category: 'timing' | 'learning' | 'inference' | 'perception' | 'memory' | 'goals';
}

export interface ModificationRequest {
  /** Parameter key to modify */
  key: string;
  /** New value to set */
  newValue: number;
  /** Reason for the modification */
  reason: string;
  /** Source of the modification request */
  source: 'enaction' | 'reflection' | 'coherence_recovery' | 'dead_man_switch';
  /** Coherence at time of request */
  coherenceAtRequest: number;
}

export interface ModificationResult {
  /** Whether the modification was applied */
  applied: boolean;
  /** The parameter that was modified */
  key: string;
  /** Previous value */
  previousValue: number;
  /** New value (may be clamped) */
  newValue: number;
  /** Reason for the modification */
  reason: string;
  /** If not applied, why */
  rejectionReason?: string;
  /** Timestamp */
  timestamp: number;
  /** Modification index */
  index: number;
}

export interface SelfModificationConfig {
  /** Maximum modifications per minute */
  maxModificationsPerMinute: number;
  /** Coherence threshold below which dead man's switch activates */
  deadManSwitchThreshold: number;
  /** Enable persistence of modification history */
  enablePersistence: boolean;
  /** Maximum history entries to keep */
  maxHistorySize: number;
  /** Cooldown period after dead man's switch (ms) */
  deadManSwitchCooldown: number;
  /** Enable dry-run mode (log but don't apply) */
  dryRun: boolean;
}

const DEFAULT_CONFIG: SelfModificationConfig = {
  maxModificationsPerMinute: 10,
  deadManSwitchThreshold: 0.2,
  enablePersistence: true,
  maxHistorySize: 10000,
  deadManSwitchCooldown: 60000,
  dryRun: false,
};

// ============================================================
// Self-Modification Engine
// ============================================================

export class SelfModificationEngine extends EventEmitter {
  private config: SelfModificationConfig;
  private parameters: Map<string, ModifiableParameter> = new Map();
  private history: ModificationResult[] = [];
  private recentModifications: number[] = []; // timestamps for rate limiting
  private deadManSwitchActive: boolean = false;
  private deadManSwitchUntil: number = 0;
  private totalModifications: number = 0;
  private totalRejections: number = 0;
  private onApplyCallbacks: Map<string, (value: number) => void> = new Map();

  constructor(config: Partial<SelfModificationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeDefaultParameters();
  }

  // ─── Parameter Registration ────────────────────────────────

  private initializeDefaultParameters(): void {
    const defaults: ModifiableParameter[] = [
      // Timing parameters
      {
        key: 'echobeats.cycleInterval',
        description: 'Echobeats cognitive cycle interval (ms)',
        currentValue: 2000, defaultValue: 2000,
        min: 500, max: 30000, maxDeltaFraction: 0.3,
        category: 'timing',
      },
      {
        key: 'perception.scanInterval',
        description: 'Perception handler scan interval (ms)',
        currentValue: 5000, defaultValue: 5000,
        min: 1000, max: 60000, maxDeltaFraction: 0.3,
        category: 'perception',
      },
      {
        key: 'consolidation.interval',
        description: 'Memory consolidation interval (ms)',
        currentValue: 300000, defaultValue: 300000,
        min: 60000, max: 3600000, maxDeltaFraction: 0.5,
        category: 'memory',
      },
      // Learning parameters
      {
        key: 'reservoir.forgettingFactor',
        description: 'RLS forgetting factor (adaptation speed)',
        currentValue: 0.995, defaultValue: 0.995,
        min: 0.9, max: 0.9999, maxDeltaFraction: 0.1,
        category: 'learning',
      },
      {
        key: 'reservoir.spectralRadius',
        description: 'ESN spectral radius (memory capacity)',
        currentValue: 0.95, defaultValue: 0.95,
        min: 0.5, max: 1.5, maxDeltaFraction: 0.1,
        category: 'learning',
      },
      {
        key: 'reservoir.leakingRate',
        description: 'ESN leaking rate (temporal dynamics)',
        currentValue: 0.3, defaultValue: 0.3,
        min: 0.01, max: 1.0, maxDeltaFraction: 0.2,
        category: 'learning',
      },
      // Inference parameters
      {
        key: 'inference.temperature',
        description: 'LLM generation temperature',
        currentValue: 0.7, defaultValue: 0.7,
        min: 0.1, max: 2.0, maxDeltaFraction: 0.3,
        category: 'inference',
      },
      {
        key: 'inference.maxTokens',
        description: 'Maximum tokens per generation',
        currentValue: 512, defaultValue: 512,
        min: 64, max: 4096, maxDeltaFraction: 0.5,
        category: 'inference',
      },
      {
        key: 'inference.repetitionPenalty',
        description: 'Repetition penalty for generation',
        currentValue: 1.1, defaultValue: 1.1,
        min: 1.0, max: 2.0, maxDeltaFraction: 0.2,
        category: 'inference',
      },
      // Perception parameters
      {
        key: 'perception.inputScaling',
        description: 'Reservoir input scaling factor',
        currentValue: 0.5, defaultValue: 0.5,
        min: 0.01, max: 2.0, maxDeltaFraction: 0.2,
        category: 'perception',
      },
      {
        key: 'perception.attentionThreshold',
        description: 'ECAN attention threshold for activation',
        currentValue: 0.1, defaultValue: 0.1,
        min: 0.01, max: 0.5, maxDeltaFraction: 0.3,
        category: 'perception',
      },
      // Memory parameters
      {
        key: 'memory.stiDecayRate',
        description: 'Short-term importance decay rate',
        currentValue: 0.95, defaultValue: 0.95,
        min: 0.5, max: 0.999, maxDeltaFraction: 0.1,
        category: 'memory',
      },
      // Goal parameters
      {
        key: 'goals.planningInterval',
        description: 'Goal planning cycle interval (ms)',
        currentValue: 60000, defaultValue: 60000,
        min: 10000, max: 600000, maxDeltaFraction: 0.5,
        category: 'goals',
      },
      {
        key: 'goals.priorityDecay',
        description: 'Goal priority decay rate per cycle',
        currentValue: 0.99, defaultValue: 0.99,
        min: 0.8, max: 1.0, maxDeltaFraction: 0.1,
        category: 'goals',
      },
    ];

    for (const param of defaults) {
      this.parameters.set(param.key, param);
    }
  }

  /** Register a custom parameter */
  registerParameter(param: ModifiableParameter): void {
    this.parameters.set(param.key, param);
  }

  /** Register a callback to apply when a parameter changes */
  onParameterApply(key: string, callback: (value: number) => void): void {
    this.onApplyCallbacks.set(key, callback);
  }

  // ─── Modification Request Processing ───────────────────────

  /**
   * Request a parameter modification.
   * The request goes through safety validation before being applied.
   */
  requestModification(request: ModificationRequest): ModificationResult {
    const param = this.parameters.get(request.key);
    if (!param) {
      return this.reject(request, `Unknown parameter: ${request.key}`);
    }

    // Safety Check 1: Dead man's switch
    if (this.deadManSwitchActive && Date.now() < this.deadManSwitchUntil) {
      if (request.source !== 'dead_man_switch') {
        return this.reject(request, 'Dead man\'s switch active — modifications blocked');
      }
    }

    // Safety Check 2: Rate limiting
    const now = Date.now();
    this.recentModifications = this.recentModifications.filter((t) => now - t < 60000);
    if (this.recentModifications.length >= this.config.maxModificationsPerMinute) {
      return this.reject(request, `Rate limit exceeded (${this.config.maxModificationsPerMinute}/min)`);
    }

    // Safety Check 3: Coherence threshold for dead man's switch
    if (request.coherenceAtRequest < this.config.deadManSwitchThreshold) {
      this.activateDeadManSwitch();
      return this.reject(request, `Coherence ${request.coherenceAtRequest.toFixed(3)} below threshold ${this.config.deadManSwitchThreshold}`);
    }

    // Safety Check 4: Bounds clamping
    let newValue = Math.max(param.min, Math.min(param.max, request.newValue));

    // Safety Check 5: Maximum delta per modification
    const range = param.max - param.min;
    const maxDelta = range * param.maxDeltaFraction;
    const delta = newValue - param.currentValue;
    if (Math.abs(delta) > maxDelta) {
      newValue = param.currentValue + Math.sign(delta) * maxDelta;
      newValue = Math.max(param.min, Math.min(param.max, newValue));
    }

    // Apply modification
    const previousValue = param.currentValue;

    if (!this.config.dryRun) {
      param.currentValue = newValue;

      // Call apply callback if registered
      const callback = this.onApplyCallbacks.get(request.key);
      if (callback) {
        try {
          callback(newValue);
        } catch (err) {
          // Rollback on callback failure
          param.currentValue = previousValue;
          return this.reject(request, `Apply callback failed: ${(err as Error).message}`);
        }
      }
    }

    this.totalModifications++;
    this.recentModifications.push(now);

    const result: ModificationResult = {
      applied: true,
      key: request.key,
      previousValue,
      newValue,
      reason: request.reason,
      timestamp: now,
      index: this.totalModifications,
    };

    this.history.push(result);
    if (this.history.length > this.config.maxHistorySize) {
      this.history = this.history.slice(-this.config.maxHistorySize);
    }

    this.emit('modification_applied', result);
    return result;
  }

  // ─── Dead Man's Switch ─────────────────────────────────────

  /**
   * Activate the dead man's switch.
   * Resets all parameters to defaults and blocks further modifications
   * for the cooldown period.
   */
  private activateDeadManSwitch(): void {
    this.deadManSwitchActive = true;
    this.deadManSwitchUntil = Date.now() + this.config.deadManSwitchCooldown;

    // Reset all parameters to defaults
    for (const [key, param] of this.parameters) {
      const previousValue = param.currentValue;
      param.currentValue = param.defaultValue;

      const callback = this.onApplyCallbacks.get(key);
      if (callback && !this.config.dryRun) {
        try { callback(param.defaultValue); } catch { /* best effort */ }
      }

      this.history.push({
        applied: true,
        key,
        previousValue,
        newValue: param.defaultValue,
        reason: 'Dead man\'s switch — coherence collapse recovery',
        timestamp: Date.now(),
        index: ++this.totalModifications,
      });
    }

    this.emit('dead_man_switch_activated', {
      until: this.deadManSwitchUntil,
      parametersReset: this.parameters.size,
    });

    // Schedule deactivation
    setTimeout(() => {
      this.deadManSwitchActive = false;
      this.emit('dead_man_switch_deactivated');
    }, this.config.deadManSwitchCooldown);
  }

  // ─── Query Interface ───────────────────────────────────────

  getParameter(key: string): ModifiableParameter | undefined {
    return this.parameters.get(key);
  }

  getParameterValue(key: string): number | undefined {
    return this.parameters.get(key)?.currentValue;
  }

  getAllParameters(): ModifiableParameter[] {
    return Array.from(this.parameters.values());
  }

  getParametersByCategory(category: ModifiableParameter['category']): ModifiableParameter[] {
    return Array.from(this.parameters.values()).filter((p) => p.category === category);
  }

  getHistory(limit: number = 50): ModificationResult[] {
    return this.history.slice(-limit);
  }

  getStats(): {
    totalModifications: number;
    totalRejections: number;
    deadManSwitchActive: boolean;
    parametersRegistered: number;
    recentModificationsPerMinute: number;
  } {
    return {
      totalModifications: this.totalModifications,
      totalRejections: this.totalRejections,
      deadManSwitchActive: this.deadManSwitchActive,
      parametersRegistered: this.parameters.size,
      recentModificationsPerMinute: this.recentModifications.length,
    };
  }

  isDeadManSwitchActive(): boolean {
    return this.deadManSwitchActive;
  }

  // ─── Private Helpers ───────────────────────────────────────

  private reject(request: ModificationRequest, reason: string): ModificationResult {
    this.totalRejections++;
    const result: ModificationResult = {
      applied: false,
      key: request.key,
      previousValue: this.parameters.get(request.key)?.currentValue || 0,
      newValue: request.newValue,
      reason: request.reason,
      rejectionReason: reason,
      timestamp: Date.now(),
      index: this.totalModifications,
    };
    this.history.push(result);
    this.emit('modification_rejected', result);
    return result;
  }
}
