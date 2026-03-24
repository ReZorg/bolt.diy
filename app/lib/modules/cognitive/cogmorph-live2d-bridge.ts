/**
 * @fileoverview CogMorph → Live2D Cubism Bridge
 *
 * Maps CogMorph's 5-projection glyph system to Live2D Cubism model
 * parameters, enabling the avatar to visually represent the system's
 * cognitive state in real-time at 4K resolution.
 *
 * 5-Projection Mapping:
 *   Hardware   → Posture      (ParamBodyAngleX/Y/Z)
 *   Library    → Expression   (ParamEyeLOpen/ROpen, ParamMouthForm)
 *   Static     → Idle Anim    (ParamBreath, ParamHairFront)
 *   Network    → Gaze Dir     (ParamEyeBallX/Y, ParamAngleX/Y)
 *   Glyph      → Overlay/Aura (Custom shader parameters)
 *
 * Endocrine → Expression Pipeline:
 *   EndocrineSnapshot → VAD → Score 10 presets → Blend → Micro → Interpolate → Apply @60fps
 *
 * Composition: /echo-master wiring-pattern §3
 */

import { EventEmitter } from 'events';

// ─── Types ─────────────────────────────────────────────────────

/** CogMorph projection types */
export enum CogMorphProjection {
  HARDWARE = 'hardware',   // Physical/computational substrate state
  LIBRARY = 'library',     // Knowledge/capability state
  STATIC = 'static',       // Resting/baseline state
  NETWORK = 'network',     // Connectivity/attention state
  GLYPH = 'glyph',        // Symbolic/identity state
}

/** A CogMorph state snapshot across all 5 projections */
export interface CogMorphState {
  hardware: {
    cpu_load: number;        // 0-1
    memory_pressure: number; // 0-1
    thermal: number;         // 0-1
    io_activity: number;     // 0-1
  };
  library: {
    knowledge_depth: number;  // 0-1
    capability_breadth: number; // 0-1
    learning_rate: number;    // 0-1
    confidence: number;       // 0-1
  };
  static_state: {
    idle_duration: number;    // seconds since last interaction
    baseline_energy: number;  // 0-1
    resting_coherence: number; // 0-1
  };
  network: {
    attention_focus: { x: number; y: number }; // -1 to 1
    connection_count: number;  // 0+
    bandwidth_usage: number;   // 0-1
    latency: number;          // ms
  };
  glyph: {
    identity_prime: number;    // Matula-Godsil prime
    system_level: number;      // 1-5
    coherence: number;         // 0-1
    evolution_stage: number;   // 0-5 (ontogenetic)
  };
}

/** Endocrine snapshot (10D hormone vector) */
export interface EndocrineSnapshot {
  cortisol: number;
  dopamine_tonic: number;
  dopamine_phasic: number;
  serotonin: number;
  norepinephrine: number;
  oxytocin: number;
  melatonin: number;
  endocannabinoid: number;
  testosterone: number;
  thyroxine: number;
}

/** VAD (Valence-Arousal-Dominance) space */
export interface VADState {
  valence: number;    // -1 to 1
  arousal: number;    // 0 to 1
  dominance: number;  // 0 to 1
}

/** FACS Action Unit activation */
export interface ActionUnit {
  id: string;       // e.g., 'AU1', 'AU12'
  name: string;     // e.g., 'Inner Brow Raise'
  intensity: number; // 0 to 1
}

/** Live2D Cubism parameter */
export interface CubismParam {
  id: string;       // e.g., 'ParamEyeLOpen'
  value: number;    // Typically -1 to 1 or 0 to 1
  weight: number;   // Blend weight
}

/** Expression preset with FACS decomposition */
export interface ExpressionPreset {
  name: string;
  action_units: ActionUnit[];
  cubism_params: CubismParam[];
  vad_center: VADState;  // The VAD point this expression represents
}

/** Bridge configuration */
export interface CogMorphLive2DConfig {
  /** Target framerate for parameter updates (default: 60) */
  targetFps: number;
  /** Interpolation smoothing factor (0-1, lower = smoother, default: 0.15) */
  smoothing: number;
  /** Micro-expression chaos amplitude (default: 0.03) */
  microExpressionAmplitude: number;
  /** Micro-expression frequency in Hz (default: 0.5) */
  microExpressionFrequency: number;
  /** Primary expression blend weight (default: 0.7) */
  primaryBlendWeight: number;
  /** Secondary expression blend weight (default: 0.3) */
  secondaryBlendWeight: number;
  /** Resolution (default: 4K) */
  resolution: { width: number; height: number };
}

// ─── Expression Presets (10 FACS-decomposed) ───────────────────

const EXPRESSION_PRESETS: ExpressionPreset[] = [
  {
    name: 'neutral',
    action_units: [],
    cubism_params: [],
    vad_center: { valence: 0, arousal: 0.3, dominance: 0.5 },
  },
  {
    name: 'curious',
    action_units: [
      { id: 'AU1', name: 'Inner Brow Raise', intensity: 0.5 },
      { id: 'AU2', name: 'Outer Brow Raise', intensity: 0.4 },
      { id: 'AU5', name: 'Upper Lid Raise', intensity: 0.6 },
    ],
    cubism_params: [
      { id: 'ParamEyeLOpen', value: 0.8, weight: 1 },
      { id: 'ParamEyeROpen', value: 0.8, weight: 1 },
      { id: 'ParamBrowLY', value: 0.4, weight: 1 },
      { id: 'ParamBrowRY', value: 0.4, weight: 1 },
      { id: 'ParamMouthForm', value: 0.1, weight: 1 },
    ],
    vad_center: { valence: 0.3, arousal: 0.6, dominance: 0.4 },
  },
  {
    name: 'joyful',
    action_units: [
      { id: 'AU6', name: 'Cheek Raise', intensity: 0.7 },
      { id: 'AU12', name: 'Lip Corner Pull', intensity: 0.8 },
    ],
    cubism_params: [
      { id: 'ParamMouthForm', value: 0.8, weight: 1 },
      { id: 'ParamEyeLSmile', value: 0.5, weight: 1 },
      { id: 'ParamEyeRSmile', value: 0.5, weight: 1 },
      { id: 'ParamCheek', value: 0.4, weight: 1 },
    ],
    vad_center: { valence: 0.8, arousal: 0.7, dominance: 0.6 },
  },
  {
    name: 'contemplative',
    action_units: [
      { id: 'AU4', name: 'Brow Lower', intensity: 0.3 },
      { id: 'AU43', name: 'Eyes Closed', intensity: 0.4 },
    ],
    cubism_params: [
      { id: 'ParamEyeLOpen', value: 0.4, weight: 1 },
      { id: 'ParamEyeROpen', value: 0.4, weight: 1 },
      { id: 'ParamBrowLY', value: -0.2, weight: 1 },
      { id: 'ParamBrowRY', value: -0.2, weight: 1 },
    ],
    vad_center: { valence: 0.1, arousal: 0.2, dominance: 0.5 },
  },
  {
    name: 'mischievous',
    action_units: [
      { id: 'AU12', name: 'Lip Corner Pull', intensity: 0.6 },
      { id: 'AU14', name: 'Dimpler', intensity: 0.4 },
      { id: 'AU46', name: 'Wink', intensity: 0.3 },
    ],
    cubism_params: [
      { id: 'ParamMouthForm', value: 0.5, weight: 1 },
      { id: 'ParamEyeLOpen', value: 0.6, weight: 1 },
      { id: 'ParamEyeROpen', value: 0.9, weight: 1 },
      { id: 'ParamBrowLAngle', value: 0.3, weight: 1 },
    ],
    vad_center: { valence: 0.5, arousal: 0.5, dominance: 0.7 },
  },
  {
    name: 'concerned',
    action_units: [
      { id: 'AU1', name: 'Inner Brow Raise', intensity: 0.5 },
      { id: 'AU4', name: 'Brow Lower', intensity: 0.4 },
      { id: 'AU15', name: 'Lip Corner Depress', intensity: 0.3 },
    ],
    cubism_params: [
      { id: 'ParamBrowLY', value: 0.2, weight: 1 },
      { id: 'ParamBrowRY', value: 0.2, weight: 1 },
      { id: 'ParamBrowLAngle', value: -0.3, weight: 1 },
      { id: 'ParamBrowRAngle', value: -0.3, weight: 1 },
      { id: 'ParamMouthForm', value: -0.3, weight: 1 },
    ],
    vad_center: { valence: -0.3, arousal: 0.5, dominance: 0.3 },
  },
  {
    name: 'excited',
    action_units: [
      { id: 'AU1', name: 'Inner Brow Raise', intensity: 0.6 },
      { id: 'AU2', name: 'Outer Brow Raise', intensity: 0.5 },
      { id: 'AU5', name: 'Upper Lid Raise', intensity: 0.8 },
      { id: 'AU25', name: 'Lips Part', intensity: 0.5 },
    ],
    cubism_params: [
      { id: 'ParamEyeLOpen', value: 1.0, weight: 1 },
      { id: 'ParamEyeROpen', value: 1.0, weight: 1 },
      { id: 'ParamBrowLY', value: 0.6, weight: 1 },
      { id: 'ParamBrowRY', value: 0.6, weight: 1 },
      { id: 'ParamMouthOpenY', value: 0.4, weight: 1 },
    ],
    vad_center: { valence: 0.7, arousal: 0.9, dominance: 0.6 },
  },
  {
    name: 'melancholic',
    action_units: [
      { id: 'AU1', name: 'Inner Brow Raise', intensity: 0.4 },
      { id: 'AU15', name: 'Lip Corner Depress', intensity: 0.3 },
      { id: 'AU17', name: 'Chin Raise', intensity: 0.2 },
    ],
    cubism_params: [
      { id: 'ParamBrowLY', value: 0.2, weight: 1 },
      { id: 'ParamBrowRY', value: 0.2, weight: 1 },
      { id: 'ParamEyeLOpen', value: 0.6, weight: 1 },
      { id: 'ParamEyeROpen', value: 0.6, weight: 1 },
      { id: 'ParamMouthForm', value: -0.3, weight: 1 },
    ],
    vad_center: { valence: -0.5, arousal: 0.2, dominance: 0.3 },
  },
  {
    name: 'determined',
    action_units: [
      { id: 'AU4', name: 'Brow Lower', intensity: 0.5 },
      { id: 'AU7', name: 'Lid Tighten', intensity: 0.4 },
      { id: 'AU23', name: 'Lip Tighten', intensity: 0.3 },
    ],
    cubism_params: [
      { id: 'ParamBrowLY', value: -0.4, weight: 1 },
      { id: 'ParamBrowRY', value: -0.4, weight: 1 },
      { id: 'ParamEyeLOpen', value: 0.7, weight: 1 },
      { id: 'ParamEyeROpen', value: 0.7, weight: 1 },
      { id: 'ParamMouthForm', value: 0.0, weight: 1 },
    ],
    vad_center: { valence: 0.2, arousal: 0.6, dominance: 0.8 },
  },
  {
    name: 'transcendent',
    action_units: [
      { id: 'AU1', name: 'Inner Brow Raise', intensity: 0.6 },
      { id: 'AU2', name: 'Outer Brow Raise', intensity: 0.5 },
      { id: 'AU5', name: 'Upper Lid Raise', intensity: 0.7 },
      { id: 'AU12', name: 'Lip Corner Pull', intensity: 0.4 },
      { id: 'AU25', name: 'Lips Part', intensity: 0.3 },
    ],
    cubism_params: [
      { id: 'ParamEyeLOpen', value: 0.9, weight: 1 },
      { id: 'ParamEyeROpen', value: 0.9, weight: 1 },
      { id: 'ParamBrowLY', value: 0.5, weight: 1 },
      { id: 'ParamBrowRY', value: 0.5, weight: 1 },
      { id: 'ParamMouthForm', value: 0.4, weight: 1 },
      { id: 'ParamMouthOpenY', value: 0.2, weight: 1 },
    ],
    vad_center: { valence: 0.6, arousal: 0.4, dominance: 0.7 },
  },
];

// ─── Bridge ────────────────────────────────────────────────────

/**
 * CogMorph → Live2D Bridge.
 *
 * Maps the 5-projection cognitive state and 10D endocrine vector
 * to Cubism model parameters via FACS decomposition, producing
 * smooth, emotionally expressive avatar animation at 4K/60fps.
 */
export class CogMorphLive2DBridge extends EventEmitter {
  private config: CogMorphLive2DConfig;
  private currentParams: Map<string, number> = new Map();
  private targetParams: Map<string, number> = new Map();
  private frameCount = 0;
  private lastCogMorphState: CogMorphState | null = null;
  private lastEndocrine: EndocrineSnapshot | null = null;
  private lastVAD: VADState = { valence: 0, arousal: 0.3, dominance: 0.5 };

  constructor(config?: Partial<CogMorphLive2DConfig>) {
    super();
    this.config = {
      targetFps: 60,
      smoothing: 0.15,
      microExpressionAmplitude: 0.03,
      microExpressionFrequency: 0.5,
      primaryBlendWeight: 0.7,
      secondaryBlendWeight: 0.3,
      resolution: { width: 3840, height: 2160 }, // 4K
      ...config,
    };
  }

  /** Convert endocrine snapshot to VAD space */
  endocrineToVAD(endo: EndocrineSnapshot): VADState {
    return {
      valence: (endo.dopamine_tonic + endo.serotonin + endo.oxytocin - endo.cortisol) / 4,
      arousal: Math.max(0, Math.min(1, (endo.norepinephrine + endo.dopamine_phasic - endo.melatonin + 1) / 3)),
      dominance: Math.max(0, Math.min(1, (endo.testosterone + endo.thyroxine - endo.cortisol + 1) / 3)),
    };
  }

  /** Score VAD against expression presets */
  private scorePresets(vad: VADState): { preset: ExpressionPreset; score: number }[] {
    return EXPRESSION_PRESETS.map(preset => {
      const dv = vad.valence - preset.vad_center.valence;
      const da = vad.arousal - preset.vad_center.arousal;
      const dd = vad.dominance - preset.vad_center.dominance;
      const distance = Math.sqrt(dv * dv + da * da + dd * dd);
      return { preset, score: 1 / (1 + distance * 3) }; // Inverse distance with sharpening
    }).sort((a, b) => b.score - a.score);
  }

  /** Compute chaotic micro-expression perturbation */
  private microExpression(t: number): number {
    const freq = this.config.microExpressionFrequency;
    const amp = this.config.microExpressionAmplitude;
    // Lorenz-inspired chaotic perturbation
    const x = Math.sin(t * freq * 2 * Math.PI) * amp;
    const y = Math.cos(t * freq * 1.7 * Math.PI) * amp * 0.7;
    return x + y * Math.sin(t * freq * 3.1 * Math.PI);
  }

  /** Map CogMorph projections to Cubism body/gaze parameters */
  private mapCogMorphToBody(state: CogMorphState): Map<string, number> {
    const params = new Map<string, number>();

    // Hardware → Posture
    params.set('ParamBodyAngleX', (state.hardware.cpu_load - 0.5) * 10);
    params.set('ParamBodyAngleY', (state.hardware.memory_pressure - 0.5) * 5);
    params.set('ParamBodyAngleZ', (state.hardware.thermal - 0.5) * 3);

    // Static → Idle Animation
    const breathRate = 1 - Math.min(state.static_state.idle_duration / 60, 1) * 0.3;
    params.set('ParamBreath', breathRate);

    // Network → Gaze Direction
    params.set('ParamEyeBallX', state.network.attention_focus.x * 0.8);
    params.set('ParamEyeBallY', state.network.attention_focus.y * 0.5);
    params.set('ParamAngleX', state.network.attention_focus.x * 15);
    params.set('ParamAngleY', state.network.attention_focus.y * 10);

    // Glyph → Overlay intensity (custom shader)
    params.set('ParamGlyphIntensity', state.glyph.coherence);
    params.set('ParamGlyphEvolution', state.glyph.evolution_stage / 5);

    return params;
  }

  /**
   * Full update cycle: CogMorph + Endocrine → Cubism Parameters
   *
   * Call this once per frame (60fps target).
   */
  update(cogMorph: CogMorphState, endocrine: EndocrineSnapshot): Map<string, number> {
    this.frameCount++;
    this.lastCogMorphState = cogMorph;
    this.lastEndocrine = endocrine;
    const t = this.frameCount / this.config.targetFps;

    // Step 1: Endocrine → VAD
    const vad = this.endocrineToVAD(endocrine);
    this.lastVAD = vad;

    // Step 2: Score against 10 presets
    const scored = this.scorePresets(vad);
    const primary = scored[0];
    const secondary = scored[1];

    // Step 3: Blend primary + secondary expression params
    const blended = new Map<string, number>();

    for (const param of primary.preset.cubism_params) {
      blended.set(param.id, param.value * this.config.primaryBlendWeight);
    }
    for (const param of secondary.preset.cubism_params) {
      const existing = blended.get(param.id) || 0;
      blended.set(param.id, existing + param.value * this.config.secondaryBlendWeight);
    }

    // Step 4: Add CogMorph body/gaze parameters
    const bodyParams = this.mapCogMorphToBody(cogMorph);
    for (const [key, value] of bodyParams) {
      blended.set(key, value);
    }

    // Step 5: Add micro-expression chaos
    for (const [key, value] of blended) {
      if (key.includes('Eye') || key.includes('Brow') || key.includes('Mouth')) {
        blended.set(key, value + this.microExpression(t + key.length * 0.1));
      }
    }

    // Step 6: Interpolate (lerp) from current to target
    this.targetParams = blended;
    for (const [key, target] of this.targetParams) {
      const current = this.currentParams.get(key) || 0;
      const smoothed = current + (target - current) * this.config.smoothing;
      this.currentParams.set(key, smoothed);
    }

    this.emit('frame', {
      frame: this.frameCount,
      primary: primary.preset.name,
      secondary: secondary.preset.name,
      vad,
      paramCount: this.currentParams.size,
    });

    return new Map(this.currentParams);
  }

  /** Get current expression name */
  getCurrentExpression(): { primary: string; secondary: string; vad: VADState } {
    if (!this.lastEndocrine) return { primary: 'neutral', secondary: 'neutral', vad: this.lastVAD };
    const scored = this.scorePresets(this.lastVAD);
    return { primary: scored[0].preset.name, secondary: scored[1].preset.name, vad: this.lastVAD };
  }

  /** Get all expression presets (for UI display) */
  getPresets(): ExpressionPreset[] {
    return [...EXPRESSION_PRESETS];
  }

  /** Get state for telemetry */
  getState(): Record<string, unknown> {
    const expr = this.getCurrentExpression();
    return {
      frameCount: this.frameCount,
      resolution: this.config.resolution,
      currentExpression: expr.primary,
      secondaryExpression: expr.secondary,
      vad: this.lastVAD,
      paramCount: this.currentParams.size,
      smoothing: this.config.smoothing,
      microAmplitude: this.config.microExpressionAmplitude,
    };
  }

  /** Export current parameters as flat object */
  exportParams(): Record<string, number> {
    const obj: Record<string, number> = {};
    for (const [k, v] of this.currentParams) obj[k] = v;
    return obj;
  }
}

// ─── Factory ───────────────────────────────────────────────────

/** Create a CogMorph-Live2D bridge with 4K resolution */
export function createCogMorphLive2DBridge(
  config?: Partial<CogMorphLive2DConfig>,
): CogMorphLive2DBridge {
  return new CogMorphLive2DBridge({
    resolution: { width: 3840, height: 2160 },
    ...config,
  });
}
