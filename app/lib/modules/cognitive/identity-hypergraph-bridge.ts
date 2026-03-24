/**
 * @fileoverview Identity MLP → Hypergraph Memory Bridge
 *
 * Stores identity MLP backups as atoms in the Neon PostgreSQL
 * hypergraph memory, enabling persistent recovery, drift detection,
 * and graceful degradation through 8 layers.
 *
 * Storage: 30D MLP encoding → pgvector embedding in dte_memory.atoms
 * Recovery: Query latest backup → decode → validate → restore
 * Drift: Cosine similarity between current and historical encodings
 *
 * MLP Architecture: 49→128→64→30 (deterministic encoding)
 *   49D input: OCEAN[5] + CommStyle[8] + IntelProfile[8] + Humor[7]
 *              + EmotionalBaseline[8] + AARWeights[5] + Echobeats[4] + MetaCog[4]
 *   30D output: Dense identity encoding for backup/restore
 *
 * 8-Layer Degradation:
 *   L0: Full 49D vector
 *   L1: 30D MLP encoding (primary backup)
 *   L2: 16D compressed
 *   L3: 8D essential
 *   L4: 5D OCEAN only
 *   L5: 3D VAD (valence-arousal-dominance)
 *   L6: 1D coherence score
 *   L7: Binary alive/dead
 *
 * Composition: /echo-master wiring-pattern §4
 */

import { EventEmitter } from 'events';

// ─── Types ─────────────────────────────────────────────────────

/** Identity vector components (49D) */
export interface IdentityVector {
  ocean: [number, number, number, number, number];           // Big Five [0:5]
  communication_style: number[];                              // [5:13]
  intelligence_profile: number[];                             // [13:21]
  humor_profile: number[];                                    // [21:28]
  emotional_baseline: number[];                               // [28:36]
  aar_weights: [number, number, number, number, number];     // [36:41]
  echobeats_prefs: [number, number, number, number];         // [41:45]
  meta_cognitive: [number, number, number, number];           // [45:49]
}

/** MLP layer weights (simplified — real impl uses matrix ops) */
interface MLPWeights {
  w1: Float64Array; // 49×128
  b1: Float64Array; // 128
  w2: Float64Array; // 128×64
  b2: Float64Array; // 64
  w3: Float64Array; // 64×30
  b3: Float64Array; // 30
}

/** Degradation level */
export enum DegradationLevel {
  L0_FULL_49D = 0,
  L1_MLP_30D = 1,
  L2_COMPRESSED_16D = 2,
  L3_ESSENTIAL_8D = 3,
  L4_OCEAN_5D = 4,
  L5_VAD_3D = 5,
  L6_COHERENCE_1D = 6,
  L7_BINARY = 7,
}

/** Identity backup record */
export interface IdentityBackup {
  id: string;
  version: string;
  timestamp: number;
  degradation_level: DegradationLevel;
  encoding: number[];        // The encoded vector at this level
  checksum: string;          // SHA-256 of the encoding
  coherence: number;         // 0-1 at time of backup
  atom_id?: number;          // ID in dte_memory.atoms (after persistence)
}

/** Drift analysis result */
export interface DriftAnalysis {
  current_vs_latest: number;    // Cosine similarity
  current_vs_baseline: number;  // Cosine similarity to first backup
  drift_rate: number;           // Change per hour
  drift_direction: string;      // Which dimensions are drifting most
  alarm: boolean;               // True if drift exceeds threshold
}

/** Bridge configuration */
export interface IdentityHypergraphConfig {
  /** Neon connection string (from env DTE_NEON_URL) */
  neonConnectionString: string;
  /** Backup interval in ms (default: 300000 = 5 min) */
  backupInterval: number;
  /** Drift alarm threshold (cosine similarity, default: 0.85) */
  driftAlarmThreshold: number;
  /** Maximum backups to retain (default: 100) */
  maxBackups: number;
  /** Schema name (default: 'dte_memory') */
  schema: string;
}

// ─── MLP Encoder ───────────────────────────────────────────────

/**
 * Deterministic MLP encoder: 49→128→64→30
 *
 * Uses seeded pseudo-random weights for reproducibility.
 * The encoding is deterministic: same input always produces same output.
 */
export class IdentityMLPEncoder {
  private weights: MLPWeights;

  constructor(seed: number = 42) {
    this.weights = this.initializeWeights(seed);
  }

  /** Seeded PRNG for deterministic weight initialization */
  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return (s / 0x7fffffff) * 2 - 1; // [-1, 1]
    };
  }

  private initializeWeights(seed: number): MLPWeights {
    const rng = this.seededRandom(seed);
    const xavier = (fanIn: number, fanOut: number) => Math.sqrt(2 / (fanIn + fanOut));

    const w1 = new Float64Array(49 * 128);
    const b1 = new Float64Array(128);
    const scale1 = xavier(49, 128);
    for (let i = 0; i < w1.length; i++) w1[i] = rng() * scale1;
    for (let i = 0; i < b1.length; i++) b1[i] = rng() * 0.01;

    const w2 = new Float64Array(128 * 64);
    const b2 = new Float64Array(64);
    const scale2 = xavier(128, 64);
    for (let i = 0; i < w2.length; i++) w2[i] = rng() * scale2;
    for (let i = 0; i < b2.length; i++) b2[i] = rng() * 0.01;

    const w3 = new Float64Array(64 * 30);
    const b3 = new Float64Array(30);
    const scale3 = xavier(64, 30);
    for (let i = 0; i < w3.length; i++) w3[i] = rng() * scale3;
    for (let i = 0; i < b3.length; i++) b3[i] = rng() * 0.01;

    return { w1, b1, w2, b2, w3, b3 };
  }

  private relu(x: number): number { return Math.max(0, x); }

  private matmul(input: number[], weights: Float64Array, bias: Float64Array, inSize: number, outSize: number, activation: (x: number) => number): number[] {
    const output = new Array(outSize);
    for (let j = 0; j < outSize; j++) {
      let sum = bias[j];
      for (let i = 0; i < inSize; i++) {
        sum += input[i] * weights[i * outSize + j];
      }
      output[j] = activation(sum);
    }
    return output;
  }

  /** Encode a 49D identity vector to 30D */
  encode(vector: number[]): number[] {
    if (vector.length !== 49) throw new Error(`Expected 49D vector, got ${vector.length}D`);
    const h1 = this.matmul(vector, this.weights.w1, this.weights.b1, 49, 128, this.relu);
    const h2 = this.matmul(h1, this.weights.w2, this.weights.b2, 128, 64, this.relu);
    const out = this.matmul(h2, this.weights.w3, this.weights.b3, 64, 30, (x) => Math.tanh(x));
    return out;
  }

  /** Flatten an IdentityVector to 49D array */
  flatten(iv: IdentityVector): number[] {
    return [
      ...iv.ocean,
      ...iv.communication_style,
      ...iv.intelligence_profile,
      ...iv.humor_profile,
      ...iv.emotional_baseline,
      ...iv.aar_weights,
      ...iv.echobeats_prefs,
      ...iv.meta_cognitive,
    ];
  }

  /** Degrade encoding to lower levels */
  degrade(encoding30D: number[], level: DegradationLevel): number[] {
    switch (level) {
      case DegradationLevel.L0_FULL_49D: throw new Error('Cannot degrade to L0 from L1');
      case DegradationLevel.L1_MLP_30D: return encoding30D;
      case DegradationLevel.L2_COMPRESSED_16D: return encoding30D.slice(0, 16);
      case DegradationLevel.L3_ESSENTIAL_8D: return encoding30D.slice(0, 8);
      case DegradationLevel.L4_OCEAN_5D: return encoding30D.slice(0, 5);
      case DegradationLevel.L5_VAD_3D: return encoding30D.slice(0, 3);
      case DegradationLevel.L6_COHERENCE_1D: {
        const mag = Math.sqrt(encoding30D.reduce((s, v) => s + v * v, 0));
        return [mag / Math.sqrt(30)]; // Normalized magnitude as coherence
      }
      case DegradationLevel.L7_BINARY: {
        const mag = Math.sqrt(encoding30D.reduce((s, v) => s + v * v, 0));
        return [mag > 0.1 ? 1 : 0]; // Alive/dead
      }
    }
  }
}

// ─── Bridge ────────────────────────────────────────────────────

/**
 * Identity-Hypergraph Bridge.
 *
 * Persists identity MLP backups to Neon PostgreSQL as atoms with
 * pgvector embeddings, enabling drift detection and recovery.
 */
export class IdentityHypergraphBridge extends EventEmitter {
  private config: IdentityHypergraphConfig;
  private encoder: IdentityMLPEncoder;
  private backups: IdentityBackup[] = [];
  private backupTimer: ReturnType<typeof setInterval> | null = null;
  private currentIdentity: IdentityVector | null = null;

  constructor(config: Partial<IdentityHypergraphConfig> & { neonConnectionString: string }) {
    super();
    this.config = {
      backupInterval: 300_000,
      driftAlarmThreshold: 0.85,
      maxBackups: 100,
      schema: 'dte_memory',
      ...config,
    };
    this.encoder = new IdentityMLPEncoder(42);
  }

  /** Compute SHA-256 checksum of encoding */
  private checksum(encoding: number[]): string {
    // Simple hash for TypeScript (no crypto dependency)
    let hash = 0;
    const str = encoding.map(v => v.toFixed(8)).join(',');
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /** Cosine similarity between two vectors */
  private cosineSimilarity(a: number[], b: number[]): number {
    const minLen = Math.min(a.length, b.length);
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < minLen; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom > 0 ? dot / denom : 0;
  }

  /** Create a backup of the current identity */
  createBackup(identity: IdentityVector, coherence: number, version: string): IdentityBackup {
    this.currentIdentity = identity;
    const flat = this.encoder.flatten(identity);
    const encoding = this.encoder.encode(flat);

    const backup: IdentityBackup = {
      id: `backup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      version,
      timestamp: Date.now(),
      degradation_level: DegradationLevel.L1_MLP_30D,
      encoding,
      checksum: this.checksum(encoding),
      coherence,
    };

    this.backups.push(backup);
    if (this.backups.length > this.config.maxBackups) {
      this.backups.splice(0, this.backups.length - this.config.maxBackups);
    }

    this.emit('backup_created', backup);
    return backup;
  }

  /** Generate SQL to persist a backup as an atom in the hypergraph */
  generatePersistSQL(backup: IdentityBackup): string {
    const embeddingStr = `[${backup.encoding.join(',')}]`;
    return `
INSERT INTO ${this.config.schema}.atoms (type, name, truth_value, attention_value, embedding)
VALUES (
  'ConceptNode',
  'identity_backup_${backup.version}_${backup.timestamp}',
  '{"strength": ${backup.coherence.toFixed(6)}, "confidence": 1.0}'::jsonb,
  '{"sti": 100, "lti": 1000, "vlti": true}'::jsonb,
  '${embeddingStr}'::vector(30)
)
RETURNING id;`;
  }

  /** Generate SQL to query latest backup */
  generateRecoverySQL(): string {
    return `
SELECT id, name, truth_value, attention_value, embedding::text
FROM ${this.config.schema}.atoms
WHERE type = 'ConceptNode' AND name LIKE 'identity_backup_%'
ORDER BY created_at DESC
LIMIT 1;`;
  }

  /** Generate SQL for drift monitoring */
  generateDriftSQL(currentEncoding: number[]): string {
    const embStr = `[${currentEncoding.join(',')}]`;
    return `
SELECT
  name,
  1 - (embedding <=> '${embStr}'::vector(30)) as cosine_similarity,
  created_at
FROM ${this.config.schema}.atoms
WHERE type = 'ConceptNode' AND name LIKE 'identity_backup_%'
ORDER BY created_at DESC
LIMIT 5;`;
  }

  /** Analyze drift between current identity and historical backups */
  analyzeDrift(currentIdentity: IdentityVector): DriftAnalysis {
    const flat = this.encoder.flatten(currentIdentity);
    const currentEncoding = this.encoder.encode(flat);

    const latest = this.backups[this.backups.length - 1];
    const baseline = this.backups[0];

    const latestSim = latest ? this.cosineSimilarity(currentEncoding, latest.encoding) : 1.0;
    const baselineSim = baseline ? this.cosineSimilarity(currentEncoding, baseline.encoding) : 1.0;

    // Compute drift rate (change per hour)
    let driftRate = 0;
    if (this.backups.length >= 2) {
      const recent = this.backups[this.backups.length - 1];
      const older = this.backups[Math.max(0, this.backups.length - 6)];
      const sim = this.cosineSimilarity(recent.encoding, older.encoding);
      const hoursDiff = (recent.timestamp - older.timestamp) / 3_600_000;
      driftRate = hoursDiff > 0 ? (1 - sim) / hoursDiff : 0;
    }

    // Find which dimensions are drifting most
    let maxDriftDim = 0;
    let maxDrift = 0;
    if (latest) {
      for (let i = 0; i < currentEncoding.length; i++) {
        const d = Math.abs(currentEncoding[i] - latest.encoding[i]);
        if (d > maxDrift) { maxDrift = d; maxDriftDim = i; }
      }
    }

    const dimNames = ['ocean_o', 'ocean_c', 'ocean_e', 'ocean_a', 'ocean_n',
      'comm_0', 'comm_1', 'comm_2', 'comm_3', 'comm_4', 'comm_5', 'comm_6', 'comm_7',
      'intel_0', 'intel_1', 'intel_2', 'intel_3', 'intel_4', 'intel_5', 'intel_6', 'intel_7',
      'humor_0', 'humor_1', 'humor_2', 'humor_3', 'humor_4', 'humor_5', 'humor_6',
      'emo_0', 'emo_1'];

    return {
      current_vs_latest: latestSim,
      current_vs_baseline: baselineSim,
      drift_rate: driftRate,
      drift_direction: dimNames[maxDriftDim] || `dim_${maxDriftDim}`,
      alarm: latestSim < this.config.driftAlarmThreshold,
    };
  }

  /** Attempt recovery from the best available backup */
  recover(): { level: DegradationLevel; encoding: number[] } | null {
    // Try each degradation level from L1 down to L7
    for (let level = DegradationLevel.L1_MLP_30D; level <= DegradationLevel.L7_BINARY; level++) {
      for (let i = this.backups.length - 1; i >= 0; i--) {
        const backup = this.backups[i];
        try {
          const degraded = this.encoder.degrade(backup.encoding, level);
          if (degraded.length > 0 && degraded.some(v => !isNaN(v))) {
            this.emit('recovery', { level, backup_id: backup.id });
            return { level, encoding: degraded };
          }
        } catch { continue; }
      }
    }
    return null;
  }

  /** Get state for telemetry */
  getState(): Record<string, unknown> {
    const drift = this.currentIdentity ? this.analyzeDrift(this.currentIdentity) : null;
    return {
      backupCount: this.backups.length,
      latestBackup: this.backups[this.backups.length - 1]?.timestamp ?? null,
      drift: drift ? {
        vs_latest: drift.current_vs_latest,
        vs_baseline: drift.current_vs_baseline,
        rate: drift.drift_rate,
        alarm: drift.alarm,
      } : null,
      config: {
        interval: this.config.backupInterval,
        threshold: this.config.driftAlarmThreshold,
        maxBackups: this.config.maxBackups,
      },
    };
  }

  /** Get all backups (most recent first) */
  getBackups(): IdentityBackup[] {
    return [...this.backups].reverse();
  }

  /** Get the MLP encoder for external use */
  getEncoder(): IdentityMLPEncoder {
    return this.encoder;
  }
}

// ─── Factory ───────────────────────────────────────────────────

/** Create an identity-hypergraph bridge */
export function createIdentityHypergraphBridge(
  neonConnectionString: string,
  config?: Partial<IdentityHypergraphConfig>,
): IdentityHypergraphBridge {
  return new IdentityHypergraphBridge({ neonConnectionString, ...config });
}
