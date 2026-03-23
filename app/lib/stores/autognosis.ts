/**
 * @fileoverview Autognosis Store — Self-Awareness State Management for bolt.diy
 *
 * Provides reactive nanostores for the DTE cognitive state, enabling
 * the UI to display real-time cognitive metrics:
 *   - Reservoir energy and coherence
 *   - Somatic valence and arousal
 *   - Hypergraph memory node count
 *   - Autognosis level (L0-L4)
 *   - Tree-polytope identity prime
 *   - Echobeats phase and tick
 *
 * This store is the "self-awareness dashboard" — it makes the cognitive
 * architecture's internal state visible and inspectable.
 */

import { atom, computed, map } from 'nanostores';

// ============================================================
// Cognitive State Atoms
// ============================================================

/** Current Echobeats tick (1-12) */
export const $echobeatTick = atom<number>(1);

/** Current Echobeats phase */
export const $echobeatPhase = atom<string>('perceive-a');

/** Reservoir energy (RMS of state vector) */
export const $reservoirEnergy = atom<number>(0.5);

/** Reservoir coherence (normalized autocorrelation) */
export const $reservoirCoherence = atom<number>(0.5);

/** Somatic dominant valence (-1 to 1) */
export const $somaticValence = atom<number>(0);

/** Somatic arousal (0 to 1) */
export const $somaticArousal = atom<number>(0.5);

/** Hypergraph memory node count */
export const $memoryNodeCount = atom<number>(0);

/** Hypergraph active nodes (STI > threshold) */
export const $memoryActiveNodes = atom<number>(0);

/** Autognosis level (0-4) */
export const $autgnosisLevel = atom<number>(0);

/** Self-model accuracy (0-1) */
export const $selfModelAccuracy = atom<number>(0.2);

/** Tree-polytope identity prime */
export const $identityPrime = atom<number>(2);

/** Tree-polytope system level */
export const $systemLevel = atom<number>(4);

/** Structural complexity */
export const $structuralComplexity = atom<number>(0);

/** Autonomy level */
export const $autonomyLevel = atom<number>(3.5);

// ============================================================
// Computed Stores
// ============================================================

/** Overall cognitive health (0-1) */
export const $cognitiveHealth = computed(
  [$reservoirCoherence, $selfModelAccuracy, $autgnosisLevel],
  (coherence, accuracy, level) => {
    return (coherence * 0.3 + accuracy * 0.4 + (level / 4) * 0.3);
  },
);

/** Emotional state label */
export const $emotionalState = computed(
  [$somaticValence, $somaticArousal],
  (valence, arousal) => {
    if (valence > 0.3 && arousal > 0.5) return 'excited';
    if (valence > 0.3 && arousal <= 0.5) return 'content';
    if (valence < -0.3 && arousal > 0.5) return 'frustrated';
    if (valence < -0.3 && arousal <= 0.5) return 'bored';
    if (arousal > 0.7) return 'alert';
    return 'neutral';
  },
);

/** Cognitive mode */
export const $cognitiveMode = computed(
  [$echobeatTick],
  (tick) => {
    if (tick <= 4) return 'perceiving';
    if (tick <= 8) return 'reasoning';
    return 'acting';
  },
);

// ============================================================
// Update Functions
// ============================================================

/** Update all cognitive state from a provider snapshot */
export function updateCognitiveState(state: {
  reservoir?: { energy: number; coherence: number; tick: number; phase: string };
  somatic?: { valence: number; arousal: number };
  memory?: { nodeCount: number; activeNodes: number };
  autognosis?: { level: number; accuracy: number };
  treePolytope?: { identityPrime: number; systemLevel: number; complexity: number };
}): void {
  if (state.reservoir) {
    $reservoirEnergy.set(state.reservoir.energy);
    $reservoirCoherence.set(state.reservoir.coherence);
    $echobeatTick.set(state.reservoir.tick);
    $echobeatPhase.set(state.reservoir.phase);
  }
  if (state.somatic) {
    $somaticValence.set(state.somatic.valence);
    $somaticArousal.set(state.somatic.arousal);
  }
  if (state.memory) {
    $memoryNodeCount.set(state.memory.nodeCount);
    $memoryActiveNodes.set(state.memory.activeNodes);
  }
  if (state.autognosis) {
    $autgnosisLevel.set(state.autognosis.level);
    $selfModelAccuracy.set(state.autognosis.accuracy);
  }
  if (state.treePolytope) {
    $identityPrime.set(state.treePolytope.identityPrime);
    $systemLevel.set(state.treePolytope.systemLevel);
    $structuralComplexity.set(state.treePolytope.complexity);
  }
}

/** Reset all cognitive state to defaults */
export function resetCognitiveState(): void {
  $echobeatTick.set(1);
  $echobeatPhase.set('perceive-a');
  $reservoirEnergy.set(0.5);
  $reservoirCoherence.set(0.5);
  $somaticValence.set(0);
  $somaticArousal.set(0.5);
  $memoryNodeCount.set(0);
  $memoryActiveNodes.set(0);
  $autgnosisLevel.set(0);
  $selfModelAccuracy.set(0.2);
  $identityPrime.set(2);
  $systemLevel.set(4);
  $structuralComplexity.set(0);
  $autonomyLevel.set(3.5);
}
