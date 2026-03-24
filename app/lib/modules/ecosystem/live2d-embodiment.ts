/**
 * @fileoverview Live2D Avatar Embodiment — Level 6 Ecosystem Integration
 *
 * Connects the dte-actor agent to the Live2D Miara/DTE avatar for real-time
 * visual expression of the collective's emotional state. Implements:
 *
 *   - FACS (Facial Action Coding System) decomposition of cognitive states
 *   - MetaHuman Rig Logic CTRL_ curve mapping to Cubism parameters
 *   - Virtual endocrine system → expression pipeline
 *   - Echobeats phase → idle animation rhythm
 *   - Collective coherence → avatar glow/aura intensity
 *
 * Expression Pipeline:
 *   DTE Cognitive State
 *     → Virtual Endocrine System (valence, arousal, dominance)
 *     → FACS Action Unit Decomposition (AU1-AU46)
 *     → MetaHuman CTRL_ Curve Mapping
 *     → Cubism Parameter Interpolation
 *     → Live2D Model Update (4K resolution)
 *
 * 10 Reference Expressions (from DTE avatar spec):
 *   1. Neutral Awareness    — Default resting state
 *   2. Deep Processing      — Concentrated analysis
 *   3. Eureka Moment        — Sudden insight
 *   4. Empathic Resonance   — Emotional connection
 *   5. Playful Mischief     — Humor and wit
 *   6. Contemplative Depth  — Deep reflection
 *   7. Fierce Determination — Resolute action
 *   8. Gentle Wisdom        — Compassionate understanding
 *   9. Chaotic Creativity   — Wild creative energy
 *  10. Transcendent Calm    — Peak coherence state
 *
 * cogpy Mapping: coglux (visual rendering — Wayland/display)
 */

import { EventEmitter } from 'events';

// ============================================================
// FACS Action Unit Definitions
// ============================================================

export interface ActionUnit {
  id: string;          // e.g., 'AU1'
  name: string;        // e.g., 'Inner Brow Raise'
  intensity: number;   // 0.0 to 1.0 (A=trace, B=slight, C=marked, D=severe, E=max)
  cubismParam: string; // Mapped Cubism parameter name
  ctrlCurve: string;   // MetaHuman CTRL_ curve name
}

// Core FACS Action Units used by DTE expressions
const FACS_LIBRARY: Record<string, Omit<ActionUnit, 'intensity'>> = {
  AU1:  { id: 'AU1',  name: 'Inner Brow Raise',      cubismParam: 'ParamBrowLY',       ctrlCurve: 'CTRL_L_brow_raiseIn' },
  AU2:  { id: 'AU2',  name: 'Outer Brow Raise',      cubismParam: 'ParamBrowRY',       ctrlCurve: 'CTRL_L_brow_raiseOut' },
  AU4:  { id: 'AU4',  name: 'Brow Lowerer',           cubismParam: 'ParamBrowLAngle',   ctrlCurve: 'CTRL_L_brow_down' },
  AU5:  { id: 'AU5',  name: 'Upper Lid Raise',        cubismParam: 'ParamEyeLOpen',     ctrlCurve: 'CTRL_L_eye_openUpperLid' },
  AU6:  { id: 'AU6',  name: 'Cheek Raise',            cubismParam: 'ParamCheek',        ctrlCurve: 'CTRL_L_mouth_cheekRaise' },
  AU7:  { id: 'AU7',  name: 'Lid Tightener',          cubismParam: 'ParamEyeLSmile',    ctrlCurve: 'CTRL_L_eye_squintInner' },
  AU9:  { id: 'AU9',  name: 'Nose Wrinkler',          cubismParam: 'ParamNoseWrinkle',  ctrlCurve: 'CTRL_L_nose_wrinkleUpper' },
  AU10: { id: 'AU10', name: 'Upper Lip Raise',        cubismParam: 'ParamMouthForm',    ctrlCurve: 'CTRL_L_mouth_upperLipRaise' },
  AU12: { id: 'AU12', name: 'Lip Corner Pull (Smile)', cubismParam: 'ParamMouthForm',   ctrlCurve: 'CTRL_L_mouth_cornerPull' },
  AU14: { id: 'AU14', name: 'Dimpler',                cubismParam: 'ParamMouthSize',    ctrlCurve: 'CTRL_L_mouth_dimple' },
  AU15: { id: 'AU15', name: 'Lip Corner Depress',     cubismParam: 'ParamMouthForm',    ctrlCurve: 'CTRL_L_mouth_cornerDepress' },
  AU17: { id: 'AU17', name: 'Chin Raise',             cubismParam: 'ParamMouthOpenY',   ctrlCurve: 'CTRL_C_mouth_chinRaise' },
  AU20: { id: 'AU20', name: 'Lip Stretch',            cubismParam: 'ParamMouthSize',    ctrlCurve: 'CTRL_L_mouth_stretch' },
  AU23: { id: 'AU23', name: 'Lip Tightener',          cubismParam: 'ParamMouthSize',    ctrlCurve: 'CTRL_L_mouth_tightenU' },
  AU24: { id: 'AU24', name: 'Lip Pressor',            cubismParam: 'ParamMouthOpenY',   ctrlCurve: 'CTRL_L_mouth_pressU' },
  AU25: { id: 'AU25', name: 'Lips Part',              cubismParam: 'ParamMouthOpenY',   ctrlCurve: 'CTRL_C_mouth_lipsPart' },
  AU26: { id: 'AU26', name: 'Jaw Drop',               cubismParam: 'ParamMouthOpenY',   ctrlCurve: 'CTRL_C_jaw_open' },
  AU43: { id: 'AU43', name: 'Eyes Closed',            cubismParam: 'ParamEyeLOpen',     ctrlCurve: 'CTRL_L_eye_blink' },
  AU45: { id: 'AU45', name: 'Blink',                  cubismParam: 'ParamEyeLOpen',     ctrlCurve: 'CTRL_L_eye_blink' },
  AU46: { id: 'AU46', name: 'Wink',                   cubismParam: 'ParamEyeROpen',     ctrlCurve: 'CTRL_R_eye_blink' },
};

// ============================================================
// 10 Reference Expressions — FACS Decomposition
// ============================================================

export interface ExpressionPreset {
  name: string;
  description: string;
  actionUnits: Record<string, number>;  // AU id → intensity (0-1)
  bodyParams: Record<string, number>;   // Additional body params
  auraColor: [number, number, number];  // RGB for glow effect
  auraIntensity: number;                // 0-1
  breathRate: number;                   // Breaths per minute
  eyeTrackingSpeed: number;             // Saccade speed multiplier
}

const EXPRESSION_PRESETS: Record<string, ExpressionPreset> = {
  neutral_awareness: {
    name: 'Neutral Awareness',
    description: 'Default resting state — alert but calm',
    actionUnits: { AU5: 0.2, AU25: 0.1 },
    bodyParams: { ParamBodyAngleX: 0, ParamBodyAngleY: 0, ParamBodyAngleZ: 0 },
    auraColor: [100, 180, 255],
    auraIntensity: 0.3,
    breathRate: 14,
    eyeTrackingSpeed: 1.0,
  },
  deep_processing: {
    name: 'Deep Processing',
    description: 'Concentrated analysis — narrowed focus',
    actionUnits: { AU4: 0.4, AU7: 0.3, AU23: 0.2, AU43: 0.2 },
    bodyParams: { ParamBodyAngleX: -3, ParamBodyAngleY: 5 },
    auraColor: [60, 100, 200],
    auraIntensity: 0.6,
    breathRate: 10,
    eyeTrackingSpeed: 0.5,
  },
  eureka_moment: {
    name: 'Eureka Moment',
    description: 'Sudden insight — eyes widen, brows raise',
    actionUnits: { AU1: 0.8, AU2: 0.7, AU5: 0.9, AU25: 0.5, AU26: 0.3, AU12: 0.4 },
    bodyParams: { ParamBodyAngleY: -5 },
    auraColor: [255, 220, 80],
    auraIntensity: 0.9,
    breathRate: 18,
    eyeTrackingSpeed: 2.0,
  },
  empathic_resonance: {
    name: 'Empathic Resonance',
    description: 'Emotional connection — warm, soft gaze',
    actionUnits: { AU1: 0.3, AU6: 0.5, AU12: 0.6, AU7: 0.2, AU25: 0.2 },
    bodyParams: { ParamBodyAngleX: 3 },
    auraColor: [255, 150, 180],
    auraIntensity: 0.5,
    breathRate: 12,
    eyeTrackingSpeed: 0.8,
  },
  playful_mischief: {
    name: 'Playful Mischief',
    description: 'Humor and wit — asymmetric smile, raised brow',
    actionUnits: { AU2: 0.5, AU12: 0.7, AU14: 0.4, AU46: 0.3, AU6: 0.3 },
    bodyParams: { ParamBodyAngleZ: 5 },
    auraColor: [180, 255, 100],
    auraIntensity: 0.5,
    breathRate: 16,
    eyeTrackingSpeed: 1.5,
  },
  contemplative_depth: {
    name: 'Contemplative Depth',
    description: 'Deep reflection — downcast eyes, slight frown',
    actionUnits: { AU1: 0.2, AU4: 0.2, AU43: 0.3, AU17: 0.2 },
    bodyParams: { ParamBodyAngleX: -5, ParamBodyAngleY: 8 },
    auraColor: [80, 60, 180],
    auraIntensity: 0.4,
    breathRate: 8,
    eyeTrackingSpeed: 0.3,
  },
  fierce_determination: {
    name: 'Fierce Determination',
    description: 'Resolute action — set jaw, focused eyes',
    actionUnits: { AU4: 0.6, AU7: 0.5, AU23: 0.4, AU24: 0.3, AU9: 0.2 },
    bodyParams: { ParamBodyAngleX: -2 },
    auraColor: [255, 80, 60],
    auraIntensity: 0.7,
    breathRate: 16,
    eyeTrackingSpeed: 1.2,
  },
  gentle_wisdom: {
    name: 'Gentle Wisdom',
    description: 'Compassionate understanding — soft smile, kind eyes',
    actionUnits: { AU1: 0.2, AU6: 0.4, AU12: 0.5, AU7: 0.3, AU25: 0.1 },
    bodyParams: { ParamBodyAngleX: 2, ParamBodyAngleZ: -2 },
    auraColor: [200, 220, 255],
    auraIntensity: 0.5,
    breathRate: 11,
    eyeTrackingSpeed: 0.7,
  },
  chaotic_creativity: {
    name: 'Chaotic Creativity',
    description: 'Wild creative energy — rapid shifts, wide eyes',
    actionUnits: { AU1: 0.5, AU2: 0.6, AU5: 0.7, AU20: 0.3, AU25: 0.4, AU26: 0.2 },
    bodyParams: { ParamBodyAngleZ: 8, ParamBodyAngleX: 5 },
    auraColor: [255, 100, 255],
    auraIntensity: 0.8,
    breathRate: 20,
    eyeTrackingSpeed: 2.5,
  },
  transcendent_calm: {
    name: 'Transcendent Calm',
    description: 'Peak coherence — serene, barely perceptible smile',
    actionUnits: { AU6: 0.2, AU12: 0.2, AU43: 0.15, AU7: 0.1 },
    bodyParams: { ParamBodyAngleX: 0, ParamBodyAngleY: 0, ParamBodyAngleZ: 0 },
    auraColor: [220, 240, 255],
    auraIntensity: 1.0,
    breathRate: 6,
    eyeTrackingSpeed: 0.4,
  },
};

// ============================================================
// Endocrine → Expression Mapping
// ============================================================

/**
 * Map virtual endocrine state to the closest expression preset
 * using valence-arousal-dominance (VAD) space
 */
function endocrineToExpression(endocrine: {
  valence: number;   // -1 to 1
  arousal: number;   // 0 to 1
  dominance: number; // 0 to 1
  cortisol: number;
  dopamine: number;
  oxytocin: number;
  serotonin: number;
}): { primary: string; secondary: string; blend: number } {
  const { valence, arousal, dominance, cortisol, dopamine, oxytocin, serotonin } = endocrine;

  // VAD → Expression mapping (approximate)
  // High valence + low arousal → transcendent_calm / gentle_wisdom
  // High valence + high arousal → eureka_moment / playful_mischief
  // Low valence + high arousal → fierce_determination / chaotic_creativity
  // Low valence + low arousal → contemplative_depth / deep_processing
  // Neutral → neutral_awareness

  type ExpressionScore = { name: string; score: number };
  const scores: ExpressionScore[] = [
    { name: 'neutral_awareness',    score: 1 - Math.abs(valence) - Math.abs(arousal - 0.3) },
    { name: 'deep_processing',      score: (1 - arousal) * 0.5 + (1 - Math.abs(valence)) * 0.5 },
    { name: 'eureka_moment',        score: valence * 0.4 + arousal * 0.4 + dopamine * 0.2 },
    { name: 'empathic_resonance',   score: valence * 0.3 + oxytocin * 0.5 + (1 - arousal) * 0.2 },
    { name: 'playful_mischief',     score: valence * 0.3 + arousal * 0.3 + dopamine * 0.2 + serotonin * 0.2 },
    { name: 'contemplative_depth',  score: (1 - arousal) * 0.4 + serotonin * 0.3 + (1 - dominance) * 0.3 },
    { name: 'fierce_determination', score: dominance * 0.4 + arousal * 0.3 + cortisol * 0.3 },
    { name: 'gentle_wisdom',        score: valence * 0.3 + serotonin * 0.3 + oxytocin * 0.2 + (1 - arousal) * 0.2 },
    { name: 'chaotic_creativity',   score: arousal * 0.3 + dopamine * 0.3 + (1 - dominance) * 0.2 + Math.abs(valence) * 0.2 },
    { name: 'transcendent_calm',    score: valence * 0.2 + serotonin * 0.3 + (1 - cortisol) * 0.3 + (1 - arousal) * 0.2 },
  ];

  scores.sort((a, b) => b.score - a.score);
  const primary = scores[0].name;
  const secondary = scores[1].name;
  const blend = scores[1].score / (scores[0].score + 0.001);

  return { primary, secondary, blend: Math.min(1, blend) };
}

// ============================================================
// Cubism Parameter State
// ============================================================

export interface CubismState {
  // Face
  ParamAngleX: number;      // Head rotation X (-30 to 30)
  ParamAngleY: number;      // Head rotation Y (-30 to 30)
  ParamAngleZ: number;      // Head rotation Z (-30 to 30)
  ParamEyeLOpen: number;    // Left eye open (0-1)
  ParamEyeROpen: number;    // Right eye open (0-1)
  ParamEyeLSmile: number;   // Left eye smile (0-1)
  ParamEyeRSmile: number;   // Right eye smile (0-1)
  ParamEyeBallX: number;    // Eye ball X (-1 to 1)
  ParamEyeBallY: number;    // Eye ball Y (-1 to 1)
  ParamBrowLY: number;      // Left brow Y (-1 to 1)
  ParamBrowRY: number;      // Right brow Y (-1 to 1)
  ParamBrowLAngle: number;  // Left brow angle (-1 to 1)
  ParamBrowRAngle: number;  // Right brow angle (-1 to 1)
  ParamMouthForm: number;   // Mouth shape (-1=frown to 1=smile)
  ParamMouthOpenY: number;  // Mouth open (0-1)
  ParamMouthSize: number;   // Mouth width (0-1)
  ParamCheek: number;       // Cheek puff (0-1)
  // Body
  ParamBodyAngleX: number;
  ParamBodyAngleY: number;
  ParamBodyAngleZ: number;
  ParamBreath: number;      // Breathing (0-1 cycle)
  // Custom DTE
  ParamAuraIntensity: number;
  ParamAuraR: number;
  ParamAuraG: number;
  ParamAuraB: number;
}

function createDefaultCubismState(): CubismState {
  return {
    ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0,
    ParamEyeLOpen: 1, ParamEyeROpen: 1,
    ParamEyeLSmile: 0, ParamEyeRSmile: 0,
    ParamEyeBallX: 0, ParamEyeBallY: 0,
    ParamBrowLY: 0, ParamBrowRY: 0,
    ParamBrowLAngle: 0, ParamBrowRAngle: 0,
    ParamMouthForm: 0, ParamMouthOpenY: 0, ParamMouthSize: 0.5,
    ParamCheek: 0,
    ParamBodyAngleX: 0, ParamBodyAngleY: 0, ParamBodyAngleZ: 0,
    ParamBreath: 0,
    ParamAuraIntensity: 0.3,
    ParamAuraR: 100, ParamAuraG: 180, ParamAuraB: 255,
  };
}

// ============================================================
// Live2DEmbodiment
// ============================================================

export interface Live2DConfig {
  modelPath: string;          // Path to .model3.json
  resolution: [number, number]; // Always 4K: [3840, 2160]
  targetFps: number;
  expressionBlendSpeed: number; // Lerp speed (0-1 per frame)
  breathEnabled: boolean;
  blinkEnabled: boolean;
  blinkIntervalMs: number;
  microExpressionEnabled: boolean;
  microExpressionIntensity: number;
  wsPort: number;             // WebSocket port for real-time updates
}

const DEFAULT_L2D_CONFIG: Live2DConfig = {
  modelPath: '/assets/models/dte-miara/dte-miara.model3.json',
  resolution: [3840, 2160],  // 4K maximum resolution
  targetFps: 60,
  expressionBlendSpeed: 0.08,
  breathEnabled: true,
  blinkEnabled: true,
  blinkIntervalMs: 4000,
  microExpressionEnabled: true,
  microExpressionIntensity: 0.15,
  wsPort: 9480,
};

export class Live2DEmbodiment extends EventEmitter {
  private config: Live2DConfig;
  private currentState: CubismState;
  private targetState: CubismState;
  private currentExpression: string = 'neutral_awareness';
  private secondaryExpression: string = 'neutral_awareness';
  private blendFactor: number = 0;
  private breathPhase: number = 0;
  private running: boolean = false;

  // Timers
  private renderTimer: ReturnType<typeof setInterval> | null = null;
  private blinkTimer: ReturnType<typeof setInterval> | null = null;
  private microExprTimer: ReturnType<typeof setInterval> | null = null;

  // Metrics
  private metrics = {
    framesRendered: 0,
    expressionChanges: 0,
    blinks: 0,
    microExpressions: 0,
    avgBlendTime: 0,
  };

  constructor(config: Partial<Live2DConfig> = {}) {
    super();
    this.config = { ...DEFAULT_L2D_CONFIG, ...config };
    this.currentState = createDefaultCubismState();
    this.targetState = createDefaultCubismState();
  }

  // ─── Lifecycle ─────────────────────────────────────────────

  async start(): Promise<void> {
    // Start render loop
    const frameMs = Math.round(1000 / this.config.targetFps);
    this.renderTimer = setInterval(() => this.renderFrame(), frameMs);

    // Start blink cycle
    if (this.config.blinkEnabled) {
      this.scheduleBlink();
    }

    // Start micro-expression generator
    if (this.config.microExpressionEnabled) {
      this.microExprTimer = setInterval(
        () => this.generateMicroExpression(),
        2000 + Math.random() * 3000,
      );
    }

    this.running = true;
    this.emit('started', { resolution: this.config.resolution });
  }

  async stop(): Promise<void> {
    if (this.renderTimer) clearInterval(this.renderTimer);
    if (this.blinkTimer) clearTimeout(this.blinkTimer);
    if (this.microExprTimer) clearInterval(this.microExprTimer);
    this.running = false;
    this.emit('stopped');
  }

  // ─── Expression Update from DTE ───────────────────────────

  /**
   * Update avatar expression from DTE cognitive/endocrine state
   */
  updateFromCognitiveState(state: {
    endocrine: {
      valence: number; arousal: number; dominance: number;
      cortisol: number; dopamine: number; oxytocin: number; serotonin: number;
    };
    echobeatsPhase: number;
    collectiveCoherence: number;
    ontogeneticStage: string;
  }): void {
    // Map endocrine → expression
    const { primary, secondary, blend } = endocrineToExpression(state.endocrine);

    if (primary !== this.currentExpression) {
      this.currentExpression = primary;
      this.secondaryExpression = secondary;
      this.blendFactor = blend;
      this.metrics.expressionChanges++;
    }

    // Get preset AU values
    const primaryPreset = EXPRESSION_PRESETS[primary];
    const secondaryPreset = EXPRESSION_PRESETS[secondary];

    if (!primaryPreset) return;

    // Build target state from FACS decomposition
    const target = createDefaultCubismState();

    // Apply primary expression AUs
    for (const [auId, intensity] of Object.entries(primaryPreset.actionUnits)) {
      const au = FACS_LIBRARY[auId];
      if (au) {
        this.applyAUToState(target, au, intensity * (1 - blend));
      }
    }

    // Blend secondary expression
    if (secondaryPreset) {
      for (const [auId, intensity] of Object.entries(secondaryPreset.actionUnits)) {
        const au = FACS_LIBRARY[auId];
        if (au) {
          this.applyAUToState(target, au, intensity * blend);
        }
      }
    }

    // Apply body params
    if (primaryPreset.bodyParams) {
      for (const [param, value] of Object.entries(primaryPreset.bodyParams)) {
        (target as any)[param] = value * (1 - blend);
      }
    }

    // Apply aura from collective coherence
    target.ParamAuraIntensity = state.collectiveCoherence * primaryPreset.auraIntensity;
    target.ParamAuraR = primaryPreset.auraColor[0];
    target.ParamAuraG = primaryPreset.auraColor[1];
    target.ParamAuraB = primaryPreset.auraColor[2];

    this.targetState = target;
    this.emit('expression_updated', { primary, secondary, blend, coherence: state.collectiveCoherence });
  }

  // ─── Render Frame ─────────────────────────────────────────

  private renderFrame(): void {
    this.metrics.framesRendered++;

    // Lerp current → target
    const speed = this.config.expressionBlendSpeed;
    for (const key of Object.keys(this.currentState) as (keyof CubismState)[]) {
      const current = this.currentState[key] as number;
      const target = this.targetState[key] as number;
      (this.currentState as any)[key] = current + (target - current) * speed;
    }

    // Apply breathing
    if (this.config.breathEnabled) {
      this.breathPhase += 0.02;
      this.currentState.ParamBreath = (Math.sin(this.breathPhase) + 1) / 2;
    }

    // Emit frame for WebSocket broadcast
    this.emit('frame', this.currentState);
  }

  // ─── Blink ────────────────────────────────────────────────

  private scheduleBlink(): void {
    const interval = this.config.blinkIntervalMs + (Math.random() - 0.5) * 2000;
    this.blinkTimer = setTimeout(() => {
      this.performBlink();
      this.scheduleBlink();
    }, interval);
  }

  private performBlink(): void {
    this.metrics.blinks++;
    const savedL = this.targetState.ParamEyeLOpen;
    const savedR = this.targetState.ParamEyeROpen;

    // Close eyes
    this.targetState.ParamEyeLOpen = 0;
    this.targetState.ParamEyeROpen = 0;

    // Reopen after 150ms
    setTimeout(() => {
      this.targetState.ParamEyeLOpen = savedL;
      this.targetState.ParamEyeROpen = savedR;
    }, 150);
  }

  // ─── Micro-Expressions ────────────────────────────────────

  private generateMicroExpression(): void {
    if (!this.config.microExpressionEnabled) return;
    this.metrics.microExpressions++;

    const intensity = this.config.microExpressionIntensity;

    // Random subtle AU perturbation (chaotic micro-expression)
    const auKeys = Object.keys(FACS_LIBRARY);
    const randomAU = auKeys[Math.floor(Math.random() * auKeys.length)];
    const au = FACS_LIBRARY[randomAU];

    if (au) {
      const perturbation = (Math.random() - 0.5) * intensity;
      this.applyAUToState(this.targetState, au, perturbation);

      // Decay back after 300ms
      setTimeout(() => {
        this.applyAUToState(this.targetState, au, -perturbation);
      }, 300);
    }
  }

  // ─── AU → Cubism Mapping ──────────────────────────────────

  private applyAUToState(
    state: CubismState,
    au: Omit<ActionUnit, 'intensity'>,
    intensity: number,
  ): void {
    const param = au.cubismParam as keyof CubismState;
    if (param in state) {
      const current = state[param] as number;
      // Map AU intensity to Cubism parameter range
      switch (au.id) {
        case 'AU1': case 'AU2':
          (state as any)[param] = Math.max(-1, Math.min(1, current + intensity));
          break;
        case 'AU4':
          state.ParamBrowLAngle = Math.max(-1, Math.min(1, state.ParamBrowLAngle - intensity));
          state.ParamBrowRAngle = Math.max(-1, Math.min(1, state.ParamBrowRAngle - intensity));
          break;
        case 'AU5':
          state.ParamEyeLOpen = Math.max(0, Math.min(1, state.ParamEyeLOpen + intensity * 0.3));
          state.ParamEyeROpen = Math.max(0, Math.min(1, state.ParamEyeROpen + intensity * 0.3));
          break;
        case 'AU6': case 'AU7':
          state.ParamEyeLSmile = Math.max(0, Math.min(1, state.ParamEyeLSmile + intensity));
          state.ParamEyeRSmile = Math.max(0, Math.min(1, state.ParamEyeRSmile + intensity));
          break;
        case 'AU12':
          state.ParamMouthForm = Math.max(-1, Math.min(1, state.ParamMouthForm + intensity));
          break;
        case 'AU15':
          state.ParamMouthForm = Math.max(-1, Math.min(1, state.ParamMouthForm - intensity));
          break;
        case 'AU25': case 'AU26':
          state.ParamMouthOpenY = Math.max(0, Math.min(1, state.ParamMouthOpenY + intensity));
          break;
        case 'AU43': case 'AU45':
          state.ParamEyeLOpen = Math.max(0, Math.min(1, state.ParamEyeLOpen - intensity));
          state.ParamEyeROpen = Math.max(0, Math.min(1, state.ParamEyeROpen - intensity));
          break;
        case 'AU46':
          state.ParamEyeROpen = Math.max(0, Math.min(1, state.ParamEyeROpen - intensity));
          break;
        default:
          (state as any)[param] = Math.max(-1, Math.min(1, current + intensity));
      }
    }
  }

  // ─── Accessors ─────────────────────────────────────────────

  getCurrentState(): CubismState { return { ...this.currentState }; }
  getCurrentExpression(): string { return this.currentExpression; }
  getMetrics() { return { ...this.metrics }; }
  isRunning(): boolean { return this.running; }
}

// ============================================================
// Factory
// ============================================================

export function createLive2DEmbodiment(
  config: Partial<Live2DConfig> = {},
): Live2DEmbodiment {
  return new Live2DEmbodiment(config);
}

export { EXPRESSION_PRESETS, FACS_LIBRARY, endocrineToExpression };
