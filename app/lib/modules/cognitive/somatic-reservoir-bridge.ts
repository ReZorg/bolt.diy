/**
 * @fileoverview Somatic Markers → ESN Reservoir Bridge
 *
 * Feeds somatic marker activations back into the Echo State Network
 * reservoir as additional input channels, creating an embodied
 * emotional feedback loop.
 *
 * Data Flow:
 *   SomaticMarker.activate()
 *     → influence = valence * intensity * exp(-decay * age)
 *       → reservoir_bias[channel] += influence * injection_gain
 *         → reservoir_state = tanh(W_in @ input + W_res @ state + bias)
 *
 * Channel Mapping:
 *   positive_outcome  → excitatory_pool[0:10]  (amplify similar patterns)
 *   negative_outcome  → inhibitory_pool[0:10]  (suppress similar patterns)
 *   uncertainty       → noise_injection[0:5]   (increase exploration)
 *   moral_violation   → global_inhibition       (emergency brake)
 *   flow_state        → spectral_boost          (edge of chaos)
 *
 * Composition: /echo-master wiring-pattern §2
 */

import { EventEmitter } from 'events';

// ─── Types ─────────────────────────────────────────────────────

/** Somatic marker context types */
export enum MarkerContext {
  POSITIVE_OUTCOME = 'positive_outcome',
  NEGATIVE_OUTCOME = 'negative_outcome',
  UNCERTAINTY = 'uncertainty',
  MORAL_VIOLATION = 'moral_violation',
  FLOW_STATE = 'flow_state',
  SOCIAL_REWARD = 'social_reward',
  SOCIAL_PUNISHMENT = 'social_punishment',
  NOVELTY = 'novelty',
  FAMILIARITY = 'familiarity',
  DANGER = 'danger',
}

/** A somatic marker — an embodied emotional memory */
export interface SomaticMarker {
  id: string;
  context: MarkerContext;
  valence: number;       // -1 to 1 (negative to positive)
  intensity: number;     // 0 to 1
  arousal: number;       // 0 to 1
  timestamp: number;     // When the marker was created
  pattern_hash: string;  // Hash of the input pattern that triggered this marker
  decay_rate: number;    // How fast this marker fades (default: 0.001)
  source: string;        // What generated this marker
}

/** Reservoir injection channel */
export interface InjectionChannel {
  name: string;
  pool_start: number;    // Start index in reservoir state vector
  pool_size: number;     // Number of neurons in this pool
  current_bias: number;  // Current accumulated bias
  marker_count: number;  // How many markers are contributing
}

/** Bridge configuration */
export interface SomaticReservoirConfig {
  /** Reservoir size (must match EchoReservoir) */
  reservoirSize: number;
  /** Base injection gain (default: 0.1) */
  baseInjectionGain: number;
  /** Gain schedule: new markers (< 1h) */
  gainNew: number;
  /** Gain schedule: recent markers (1h-24h) */
  gainRecent: number;
  /** Gain schedule: established markers (> 24h) */
  gainEstablished: number;
  /** Gain schedule: ancient markers (> 7d) */
  gainAncient: number;
  /** Maximum total bias magnitude (safety clamp) */
  maxBiasMagnitude: number;
  /** Spectral radius boost factor for flow state (default: 0.05) */
  spectralBoostFactor: number;
  /** Global inhibition strength for moral violations (default: 0.8) */
  globalInhibitionStrength: number;
  /** Noise injection scale for uncertainty (default: 0.02) */
  noiseScale: number;
  /** Maximum active markers (oldest pruned first) */
  maxActiveMarkers: number;
}

/** Injection result for telemetry */
export interface InjectionResult {
  timestamp: number;
  active_markers: number;
  channels_affected: number;
  total_bias_magnitude: number;
  spectral_boost: number;
  global_inhibition: number;
  noise_injection: number;
}

// ─── Bridge ────────────────────────────────────────────────────

/**
 * Somatic-Reservoir Bridge: injects emotional memory into the ESN.
 *
 * The bridge maintains a pool of active somatic markers and computes
 * their cumulative influence on the reservoir state vector each tick.
 */
export class SomaticReservoirBridge extends EventEmitter {
  private config: SomaticReservoirConfig;
  private markers: Map<string, SomaticMarker> = new Map();
  private channels: Map<MarkerContext, InjectionChannel>;
  private biasVector: Float64Array;
  private spectralBoost = 0;
  private globalInhibition = 0;
  private noiseInjection = 0;

  constructor(config?: Partial<SomaticReservoirConfig>) {
    super();
    this.config = {
      reservoirSize: 256,
      baseInjectionGain: 0.1,
      gainNew: 1.0,
      gainRecent: 0.5,
      gainEstablished: 0.2,
      gainAncient: 0.05,
      maxBiasMagnitude: 0.5,
      spectralBoostFactor: 0.05,
      globalInhibitionStrength: 0.8,
      noiseScale: 0.02,
      maxActiveMarkers: 200,
      ...config,
    };

    this.biasVector = new Float64Array(this.config.reservoirSize);
    this.channels = this.initializeChannels();
  }

  private initializeChannels(): Map<MarkerContext, InjectionChannel> {
    const N = this.config.reservoirSize;
    const poolSize = Math.floor(N / 10);
    const channels = new Map<MarkerContext, InjectionChannel>();

    // Excitatory pool: first 10% of reservoir
    channels.set(MarkerContext.POSITIVE_OUTCOME, {
      name: 'excitatory_positive', pool_start: 0, pool_size: poolSize, current_bias: 0, marker_count: 0,
    });
    channels.set(MarkerContext.SOCIAL_REWARD, {
      name: 'excitatory_social', pool_start: poolSize, pool_size: poolSize, current_bias: 0, marker_count: 0,
    });
    channels.set(MarkerContext.FLOW_STATE, {
      name: 'flow_boost', pool_start: poolSize * 2, pool_size: poolSize, current_bias: 0, marker_count: 0,
    });
    channels.set(MarkerContext.NOVELTY, {
      name: 'novelty_excite', pool_start: poolSize * 3, pool_size: poolSize, current_bias: 0, marker_count: 0,
    });

    // Inhibitory pool: next 10%
    channels.set(MarkerContext.NEGATIVE_OUTCOME, {
      name: 'inhibitory_negative', pool_start: poolSize * 4, pool_size: poolSize, current_bias: 0, marker_count: 0,
    });
    channels.set(MarkerContext.SOCIAL_PUNISHMENT, {
      name: 'inhibitory_social', pool_start: poolSize * 5, pool_size: poolSize, current_bias: 0, marker_count: 0,
    });
    channels.set(MarkerContext.DANGER, {
      name: 'danger_inhibit', pool_start: poolSize * 6, pool_size: poolSize, current_bias: 0, marker_count: 0,
    });

    // Noise/exploration pool
    channels.set(MarkerContext.UNCERTAINTY, {
      name: 'uncertainty_noise', pool_start: poolSize * 7, pool_size: poolSize, current_bias: 0, marker_count: 0,
    });
    channels.set(MarkerContext.FAMILIARITY, {
      name: 'familiarity_stabilize', pool_start: poolSize * 8, pool_size: poolSize, current_bias: 0, marker_count: 0,
    });

    // Global inhibition (moral violation affects entire reservoir)
    channels.set(MarkerContext.MORAL_VIOLATION, {
      name: 'global_inhibition', pool_start: 0, pool_size: N, current_bias: 0, marker_count: 0,
    });

    return channels;
  }

  /** Register a new somatic marker */
  addMarker(marker: SomaticMarker): void {
    this.markers.set(marker.id, marker);

    // Prune oldest if over limit
    if (this.markers.size > this.config.maxActiveMarkers) {
      const sorted = [...this.markers.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = sorted.slice(0, this.markers.size - this.config.maxActiveMarkers);
      for (const [id] of toRemove) this.markers.delete(id);
    }

    this.emit('marker_added', marker);
  }

  /** Create and register a marker from raw parameters */
  createMarker(
    context: MarkerContext,
    valence: number,
    intensity: number,
    patternHash: string,
    source: string,
  ): SomaticMarker {
    const marker: SomaticMarker = {
      id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      context,
      valence: Math.max(-1, Math.min(1, valence)),
      intensity: Math.max(0, Math.min(1, intensity)),
      arousal: Math.abs(valence) * intensity,
      timestamp: Date.now(),
      pattern_hash: patternHash,
      decay_rate: 0.001,
      source,
    };
    this.addMarker(marker);
    return marker;
  }

  /** Compute the gain for a marker based on its age */
  private computeGain(marker: SomaticMarker): number {
    const ageMs = Date.now() - marker.timestamp;
    const ageHours = ageMs / 3_600_000;

    if (ageHours < 1) return this.config.gainNew;
    if (ageHours < 24) return this.config.gainRecent;
    if (ageHours < 168) return this.config.gainEstablished; // 7 days
    return this.config.gainAncient;
  }

  /** Compute the influence of a marker */
  private computeInfluence(marker: SomaticMarker): number {
    const ageMs = Date.now() - marker.timestamp;
    const decay = Math.exp(-marker.decay_rate * ageMs / 1000);
    const gain = this.computeGain(marker);
    return marker.valence * marker.intensity * decay * gain * this.config.baseInjectionGain;
  }

  /**
   * Compute the bias vector for the current tick.
   * This should be called once per Echobeats tick and added to the
   * reservoir state before the tanh activation.
   */
  computeBiasVector(): Float64Array {
    // Reset
    this.biasVector.fill(0);
    this.spectralBoost = 0;
    this.globalInhibition = 0;
    this.noiseInjection = 0;

    // Reset channel stats
    for (const channel of this.channels.values()) {
      channel.current_bias = 0;
      channel.marker_count = 0;
    }

    // Accumulate marker influences
    const deadMarkers: string[] = [];

    for (const [id, marker] of this.markers) {
      const influence = this.computeInfluence(marker);

      // Prune markers with negligible influence
      if (Math.abs(influence) < 1e-6) {
        deadMarkers.push(id);
        continue;
      }

      const channel = this.channels.get(marker.context);
      if (!channel) continue;

      channel.current_bias += influence;
      channel.marker_count++;

      // Special handling for different contexts
      if (marker.context === MarkerContext.MORAL_VIOLATION) {
        // Global inhibition: reduce all neurons
        this.globalInhibition += Math.abs(influence) * this.config.globalInhibitionStrength;
      } else if (marker.context === MarkerContext.FLOW_STATE) {
        // Spectral boost: increase spectral radius toward edge of chaos
        this.spectralBoost += influence * this.config.spectralBoostFactor;
      } else if (marker.context === MarkerContext.UNCERTAINTY) {
        // Noise injection: add stochastic exploration
        this.noiseInjection += Math.abs(influence) * this.config.noiseScale;
      } else {
        // Standard channel injection
        for (let i = channel.pool_start; i < channel.pool_start + channel.pool_size; i++) {
          if (i < this.biasVector.length) {
            this.biasVector[i] += influence / channel.pool_size;
          }
        }
      }
    }

    // Apply global inhibition (reduces all biases)
    if (this.globalInhibition > 0) {
      const inhibFactor = Math.max(0, 1 - this.globalInhibition);
      for (let i = 0; i < this.biasVector.length; i++) {
        this.biasVector[i] *= inhibFactor;
      }
    }

    // Apply noise injection
    if (this.noiseInjection > 0) {
      for (let i = 0; i < this.biasVector.length; i++) {
        this.biasVector[i] += (Math.random() * 2 - 1) * this.noiseInjection;
      }
    }

    // Safety clamp
    const maxMag = this.config.maxBiasMagnitude;
    for (let i = 0; i < this.biasVector.length; i++) {
      this.biasVector[i] = Math.max(-maxMag, Math.min(maxMag, this.biasVector[i]));
    }

    // Prune dead markers
    for (const id of deadMarkers) this.markers.delete(id);

    return this.biasVector;
  }

  /** Get the spectral radius boost (add to reservoir's spectral_radius) */
  getSpectralBoost(): number {
    return Math.max(-0.1, Math.min(0.1, this.spectralBoost));
  }

  /** Get injection result for telemetry */
  getInjectionResult(): InjectionResult {
    let totalBias = 0;
    for (let i = 0; i < this.biasVector.length; i++) {
      totalBias += Math.abs(this.biasVector[i]);
    }
    let channelsAffected = 0;
    for (const ch of this.channels.values()) {
      if (ch.marker_count > 0) channelsAffected++;
    }
    return {
      timestamp: Date.now(),
      active_markers: this.markers.size,
      channels_affected: channelsAffected,
      total_bias_magnitude: totalBias,
      spectral_boost: this.spectralBoost,
      global_inhibition: this.globalInhibition,
      noise_injection: this.noiseInjection,
    };
  }

  /** Get all active markers */
  getActiveMarkers(): SomaticMarker[] {
    return [...this.markers.values()];
  }

  /** Get channel states for telemetry */
  getChannelStates(): InjectionChannel[] {
    return [...this.channels.values()];
  }

  /** Get state for persistence */
  exportState(): { markers: SomaticMarker[]; config: SomaticReservoirConfig } {
    return { markers: [...this.markers.values()], config: this.config };
  }

  /** Restore from persisted state */
  importState(state: { markers: SomaticMarker[] }): void {
    this.markers.clear();
    for (const m of state.markers) this.markers.set(m.id, m);
  }
}

// ─── Factory ───────────────────────────────────────────────────

/** Create a somatic-reservoir bridge with default config */
export function createSomaticReservoirBridge(
  reservoirSize: number = 256,
  config?: Partial<SomaticReservoirConfig>,
): SomaticReservoirBridge {
  return new SomaticReservoirBridge({ reservoirSize, ...config });
}
