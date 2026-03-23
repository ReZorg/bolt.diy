/**
 * @fileoverview HypergraphMemoryStore — Persistent Hypergraph Memory via Neon + pgvector
 *
 * Connects the in-memory IdentityMesh and AtomSpace to a persistent
 * Neon PostgreSQL database with pgvector for semantic similarity search.
 *
 * Implements the 4 memory subsystems of the DTE Cognitive Membrane:
 *   1. Declarative  — Facts, concepts, relationships (atoms table)
 *   2. Procedural   — Skills, action sequences (procedures table)
 *   3. Episodic     — Conversations, events (episodes table)
 *   4. Intentional  — Goals, plans, desires (intentions table)
 *
 * Key features:
 *   - Conversation-to-Hypergraph transformation
 *   - pgvector semantic search across all memory subsystems
 *   - ECAN attention allocation (STI/LTI/VLTI)
 *   - Agent identity persistence (AAR state, reservoir, RLS weights)
 *   - Reservoir state time-series snapshots
 *   - Multi-agent support via agent_id partitioning
 *
 * Database: Neon PostgreSQL (project: dte-hypergraph-memory)
 * Schema: dte_memory
 *
 * cogpy Mapping: coglux (cognitive Linux userspace — persistent storage layer)
 */

import { EventEmitter } from 'events';

// ============================================================
// Types matching the PostgreSQL schema
// ============================================================

export type AtomKind = 'node' | 'link';

export type AtomType =
  | 'ConceptNode' | 'PredicateNode' | 'VariableNode' | 'NumberNode'
  | 'SchemaNode' | 'GroundedSchemaNode' | 'TypeNode'
  | 'AnchorNode' | 'TimeNode' | 'AgentNode'
  | 'ListLink' | 'InheritanceLink' | 'SimilarityLink'
  | 'ImplicationLink' | 'EvaluationLink' | 'ExecutionLink'
  | 'MemberLink' | 'ContextLink' | 'DefineLink'
  | 'BindLink' | 'SatisfactionLink' | 'StateLink'
  | 'AARLink' | 'ReservoirStateLink' | 'IdentityLink'
  | 'EpisodicLink' | 'ProceduralLink' | 'IntentionalLink'
  | 'EmotionalLink' | 'CausalLink';

export type MemorySubsystem = 'declarative' | 'procedural' | 'episodic' | 'intentional';
export type OntogeneticStage = 'embryonic' | 'infant' | 'child' | 'adolescent' | 'adult' | 'elder';

export interface TruthValue {
  strength: number;
  confidence: number;
}

export interface AttentionValue {
  sti: number;
  lti: number;
  vlti: number;
}

export interface HypergraphAtom {
  atomId?: number;
  agentId: string;
  kind: AtomKind;
  atomType: AtomType;
  name?: string;
  outgoing?: number[];
  truthValue: TruthValue;
  attentionValue: AttentionValue;
  subsystem: MemorySubsystem;
  embedding?: number[];
  valence?: number;
  arousal?: number;
  metadata?: Record<string, unknown>;
}

export interface Episode {
  episodeId?: number;
  agentId: string;
  episodeType: string;
  title?: string;
  summary?: string;
  startedAt: Date;
  endedAt?: Date;
  avgValence?: number;
  avgArousal?: number;
  echobeatsStep?: number;
  reservoirEnergy?: number;
  coherence?: number;
  embedding?: number[];
  messages: Array<{
    role: string;
    content: string;
    timestamp: number;
    valence?: number;
  }>;
  metadata?: Record<string, unknown>;
}

export interface AgentState {
  agentId: string;
  agentName: string;
  ontogeneticStage: OntogeneticStage;
  interactionCount: number;
  coherence: number;
  agentState: Record<string, unknown>;
  arenaState: Record<string, unknown>;
  relationState: Record<string, unknown>;
  reservoirState: Record<string, unknown>;
  learnerState: Record<string, unknown>;
  modificationState: Record<string, unknown>;
}

export interface SemanticSearchResult {
  atomId: number;
  atomType: AtomType;
  name: string;
  similarity: number;
  tvStrength: number;
  avSti: number;
  subsystem: MemorySubsystem;
}

export interface MemoryStoreConfig {
  connectionString: string;
  agentName: string;
  embeddingDim: number;
  maxPoolSize: number;
  syncIntervalMs: number;
  attentionDecayRate: number;
  attentionPromotionThreshold: number;
}

const DEFAULT_CONFIG: MemoryStoreConfig = {
  connectionString: '',
  agentName: 'dte-bolt-primary',
  embeddingDim: 384,
  maxPoolSize: 5,
  syncIntervalMs: 30000,
  attentionDecayRate: 0.01,
  attentionPromotionThreshold: 0.7,
};

// ============================================================
// SQL Query Templates
// ============================================================

const SQL = {
  // Agent management
  UPSERT_AGENT: `
    INSERT INTO dte_memory.agents (agent_name, ontogenetic_stage, interaction_count, coherence,
      agent_state, arena_state, relation_state, reservoir_state, learner_state, modification_state, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (agent_name) DO UPDATE SET
      ontogenetic_stage = EXCLUDED.ontogenetic_stage,
      interaction_count = EXCLUDED.interaction_count,
      coherence = EXCLUDED.coherence,
      agent_state = EXCLUDED.agent_state,
      arena_state = EXCLUDED.arena_state,
      relation_state = EXCLUDED.relation_state,
      reservoir_state = EXCLUDED.reservoir_state,
      learner_state = EXCLUDED.learner_state,
      modification_state = EXCLUDED.modification_state,
      last_active_at = NOW()
    RETURNING agent_id`,

  GET_AGENT: `
    SELECT * FROM dte_memory.agents WHERE agent_name = $1`,

  // Atom operations
  INSERT_ATOM: `
    INSERT INTO dte_memory.atoms (agent_id, kind, atom_type, name, outgoing,
      tv_strength, tv_confidence, av_sti, av_lti, av_vlti,
      subsystem, embedding, valence, arousal, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING atom_id`,

  GET_ATOM: `
    SELECT * FROM dte_memory.atoms WHERE atom_id = $1`,

  GET_ATOMS_BY_NAME: `
    SELECT * FROM dte_memory.atoms WHERE agent_id = $1 AND name = $2`,

  GET_ATOMS_BY_TYPE: `
    SELECT * FROM dte_memory.atoms WHERE agent_id = $1 AND atom_type = $2
    ORDER BY av_sti DESC LIMIT $3`,

  UPDATE_ATTENTION: `
    UPDATE dte_memory.atoms SET av_sti = $2, av_lti = $3, av_vlti = $4, accessed_at = NOW()
    WHERE atom_id = $1`,

  // Semantic search
  SEMANTIC_SEARCH: `
    SELECT atom_id, atom_type, name,
      1 - (embedding <=> $2::vector) AS similarity,
      tv_strength, av_sti, subsystem
    FROM dte_memory.atoms
    WHERE agent_id = $1 AND embedding IS NOT NULL
      AND ($3::text IS NULL OR subsystem = $3::dte_memory.memory_subsystem)
    ORDER BY embedding <=> $2::vector
    LIMIT $4`,

  // Episode operations
  INSERT_EPISODE: `
    INSERT INTO dte_memory.episodes (agent_id, episode_type, title, summary,
      started_at, ended_at, avg_valence, avg_arousal,
      echobeats_step, reservoir_energy, coherence, embedding, messages, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING episode_id`,

  GET_RECENT_EPISODES: `
    SELECT * FROM dte_memory.episodes
    WHERE agent_id = $1
    ORDER BY started_at DESC LIMIT $2`,

  SEARCH_EPISODES: `
    SELECT episode_id, title, summary,
      1 - (embedding <=> $2::vector) AS similarity,
      started_at, avg_valence
    FROM dte_memory.episodes
    WHERE agent_id = $1 AND embedding IS NOT NULL
    ORDER BY embedding <=> $2::vector
    LIMIT $3`,

  // Reservoir snapshots
  INSERT_SNAPSHOT: `
    INSERT INTO dte_memory.reservoir_snapshots
      (agent_id, echobeats_step, cycle_number, fast_state, slow_state,
       energy, coherence, aar_coherence, rls_error)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,

  GET_RECENT_SNAPSHOTS: `
    SELECT * FROM dte_memory.reservoir_snapshots
    WHERE agent_id = $1
    ORDER BY captured_at DESC LIMIT $2`,

  // Attention management
  DECAY_ATTENTION: `
    SELECT dte_memory.decay_attention($1, $2)`,

  PROMOTE_ATTENTION: `
    SELECT dte_memory.promote_attention($1, $2, $3)`,

  // Statistics
  GET_MEMORY_STATS: `
    SELECT
      subsystem,
      COUNT(*) as atom_count,
      AVG(av_sti) as avg_sti,
      AVG(tv_strength) as avg_strength
    FROM dte_memory.atoms
    WHERE agent_id = $1
    GROUP BY subsystem`,
} as const;

// ============================================================
// HypergraphMemoryStore
// ============================================================

export class HypergraphMemoryStore extends EventEmitter {
  private config: MemoryStoreConfig;
  private agentId: string | null = null;
  private pool: any = null; // pg.Pool
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private pendingAtoms: HypergraphAtom[] = [];
  private running: boolean = false;

  constructor(config: Partial<MemoryStoreConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Lifecycle ─────────────────────────────────────────────

  async initialize(): Promise<void> {
    // Dynamic import of pg (Node.js only)
    const { Pool } = await import('pg' as any).catch(() => {
      // Fallback: use fetch-based Neon serverless driver
      return { Pool: null };
    });

    if (Pool) {
      this.pool = new Pool({
        connectionString: this.config.connectionString,
        max: this.config.maxPoolSize,
        ssl: { rejectUnauthorized: false },
      });
    }

    // Register or load agent
    await this.ensureAgent();

    // Start periodic sync
    this.syncTimer = setInterval(() => this.syncPendingAtoms(), this.config.syncIntervalMs);

    this.running = true;
    this.emit('initialized', { agentId: this.agentId });
  }

  async shutdown(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // Flush pending atoms
    await this.syncPendingAtoms();

    if (this.pool) {
      await this.pool.end();
    }

    this.running = false;
    this.emit('shutdown');
  }

  // ─── Agent Management ──────────────────────────────────────

  private async ensureAgent(): Promise<void> {
    const result = await this.query(SQL.GET_AGENT, [this.config.agentName]);
    if (result.rows.length > 0) {
      this.agentId = result.rows[0].agent_id;
      this.emit('agent_loaded', { agentId: this.agentId, stage: result.rows[0].ontogenetic_stage });
    } else {
      const insertResult = await this.query(SQL.UPSERT_AGENT, [
        this.config.agentName, 'embryonic', 0, 0.5,
        '{}', '{}', '{}', '{}', '{}', '{}', '{}',
      ]);
      this.agentId = insertResult.rows[0].agent_id;
      this.emit('agent_created', { agentId: this.agentId });
    }
  }

  async saveAgentState(state: Partial<AgentState>): Promise<void> {
    if (!this.agentId) return;
    await this.query(SQL.UPSERT_AGENT, [
      this.config.agentName,
      state.ontogeneticStage || 'embryonic',
      state.interactionCount || 0,
      state.coherence || 0.5,
      JSON.stringify(state.agentState || {}),
      JSON.stringify(state.arenaState || {}),
      JSON.stringify(state.relationState || {}),
      JSON.stringify(state.reservoirState || {}),
      JSON.stringify(state.learnerState || {}),
      JSON.stringify(state.modificationState || {}),
      JSON.stringify({}),
    ]);
    this.emit('agent_state_saved');
  }

  async loadAgentState(): Promise<AgentState | null> {
    if (!this.agentId) return null;
    const result = await this.query(SQL.GET_AGENT, [this.config.agentName]);
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      agentId: row.agent_id,
      agentName: row.agent_name,
      ontogeneticStage: row.ontogenetic_stage,
      interactionCount: row.interaction_count,
      coherence: row.coherence,
      agentState: row.agent_state,
      arenaState: row.arena_state,
      relationState: row.relation_state,
      reservoirState: row.reservoir_state,
      learnerState: row.learner_state,
      modificationState: row.modification_state,
    };
  }

  // ─── Atom Operations (AtomSpace) ───────────────────────────

  async addNode(
    atomType: AtomType,
    name: string,
    options: {
      tv?: Partial<TruthValue>;
      av?: Partial<AttentionValue>;
      subsystem?: MemorySubsystem;
      embedding?: number[];
      valence?: number;
      arousal?: number;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<number> {
    const result = await this.query(SQL.INSERT_ATOM, [
      this.agentId,
      'node',
      atomType,
      name,
      null, // outgoing
      options.tv?.strength ?? 1.0,
      options.tv?.confidence ?? 1.0,
      options.av?.sti ?? 0,
      options.av?.lti ?? 0,
      options.av?.vlti ?? 0,
      options.subsystem ?? 'declarative',
      options.embedding ? `[${options.embedding.join(',')}]` : null,
      options.valence ?? 0,
      options.arousal ?? 0,
      JSON.stringify(options.metadata ?? {}),
    ]);
    const atomId = result.rows[0].atom_id;
    this.emit('atom_added', { atomId, type: atomType, name });
    return atomId;
  }

  async addLink(
    atomType: AtomType,
    outgoing: number[],
    options: {
      tv?: Partial<TruthValue>;
      av?: Partial<AttentionValue>;
      subsystem?: MemorySubsystem;
      embedding?: number[];
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<number> {
    const result = await this.query(SQL.INSERT_ATOM, [
      this.agentId,
      'link',
      atomType,
      null, // name
      `{${outgoing.join(',')}}`, // PostgreSQL array literal
      options.tv?.strength ?? 1.0,
      options.tv?.confidence ?? 1.0,
      options.av?.sti ?? 0,
      options.av?.lti ?? 0,
      options.av?.vlti ?? 0,
      options.subsystem ?? 'declarative',
      options.embedding ? `[${options.embedding.join(',')}]` : null,
      0, // valence
      0, // arousal
      JSON.stringify(options.metadata ?? {}),
    ]);
    const atomId = result.rows[0].atom_id;
    this.emit('link_added', { atomId, type: atomType, outgoing });
    return atomId;
  }

  async getAtomsByName(name: string): Promise<HypergraphAtom[]> {
    const result = await this.query(SQL.GET_ATOMS_BY_NAME, [this.agentId, name]);
    return result.rows.map(this.rowToAtom);
  }

  async getAtomsByType(atomType: AtomType, limit: number = 50): Promise<HypergraphAtom[]> {
    const result = await this.query(SQL.GET_ATOMS_BY_TYPE, [this.agentId, atomType, limit]);
    return result.rows.map(this.rowToAtom);
  }

  // ─── Semantic Search ───────────────────────────────────────

  async semanticSearch(
    queryEmbedding: number[],
    options: {
      subsystem?: MemorySubsystem;
      limit?: number;
    } = {},
  ): Promise<SemanticSearchResult[]> {
    const embStr = `[${queryEmbedding.join(',')}]`;
    const result = await this.query(SQL.SEMANTIC_SEARCH, [
      this.agentId,
      embStr,
      options.subsystem ?? null,
      options.limit ?? 10,
    ]);
    return result.rows.map((r: any) => ({
      atomId: r.atom_id,
      atomType: r.atom_type,
      name: r.name,
      similarity: parseFloat(r.similarity),
      tvStrength: r.tv_strength,
      avSti: r.av_sti,
      subsystem: r.subsystem,
    }));
  }

  // ─── Episodic Memory ──────────────────────────────────────

  async storeEpisode(episode: Omit<Episode, 'episodeId'>): Promise<number> {
    const result = await this.query(SQL.INSERT_EPISODE, [
      this.agentId,
      episode.episodeType,
      episode.title,
      episode.summary,
      episode.startedAt.toISOString(),
      episode.endedAt?.toISOString() ?? null,
      episode.avgValence ?? 0,
      episode.avgArousal ?? 0,
      episode.echobeatsStep ?? null,
      episode.reservoirEnergy ?? null,
      episode.coherence ?? null,
      episode.embedding ? `[${episode.embedding.join(',')}]` : null,
      JSON.stringify(episode.messages),
      JSON.stringify(episode.metadata ?? {}),
    ]);
    const episodeId = result.rows[0].episode_id;
    this.emit('episode_stored', { episodeId, type: episode.episodeType });
    return episodeId;
  }

  async getRecentEpisodes(limit: number = 10): Promise<Episode[]> {
    const result = await this.query(SQL.GET_RECENT_EPISODES, [this.agentId, limit]);
    return result.rows.map(this.rowToEpisode);
  }

  async searchEpisodes(queryEmbedding: number[], limit: number = 5): Promise<any[]> {
    const embStr = `[${queryEmbedding.join(',')}]`;
    const result = await this.query(SQL.SEARCH_EPISODES, [this.agentId, embStr, limit]);
    return result.rows;
  }

  // ─── Conversation-to-Hypergraph ────────────────────────────

  async storeConversation(
    messages: Array<{ role: string; content: string; timestamp?: number }>,
    cognitiveState: {
      echobeatsStep?: number;
      reservoirEnergy?: number;
      coherence?: number;
      valence?: number;
      arousal?: number;
    } = {},
    embedFn?: (text: string) => Promise<number[]>,
  ): Promise<{ episodeId: number; atomIds: number[] }> {
    const atomIds: number[] = [];
    const now = new Date();

    // 1. Create concept nodes for key entities in the conversation
    for (const msg of messages) {
      const concepts = this.extractConcepts(msg.content);
      for (const concept of concepts) {
        const embedding = embedFn ? await embedFn(concept) : undefined;
        const atomId = await this.addNode('ConceptNode', concept, {
          subsystem: 'declarative',
          embedding,
          av: { sti: 0.5 },
          valence: cognitiveState.valence,
        });
        atomIds.push(atomId);
      }
    }

    // 2. Create the episode
    const fullText = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
    const summary = fullText.length > 500 ? fullText.substring(0, 500) + '...' : fullText;
    const embedding = embedFn ? await embedFn(summary) : undefined;

    const episodeId = await this.storeEpisode({
      agentId: this.agentId!,
      episodeType: 'conversation',
      title: messages[0]?.content.substring(0, 100),
      summary,
      startedAt: now,
      endedAt: new Date(),
      avgValence: cognitiveState.valence,
      avgArousal: cognitiveState.arousal,
      echobeatsStep: cognitiveState.echobeatsStep,
      reservoirEnergy: cognitiveState.reservoirEnergy,
      coherence: cognitiveState.coherence,
      embedding,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || Date.now(),
        valence: cognitiveState.valence,
      })),
    });

    return { episodeId, atomIds };
  }

  // ─── Reservoir Snapshots ───────────────────────────────────

  async saveReservoirSnapshot(snapshot: {
    echobeatsStep: number;
    cycleNumber: number;
    fastState: number[];
    slowState: number[];
    energy: number;
    coherence: number;
    aarCoherence: number;
    rlsError?: number;
  }): Promise<void> {
    const fastVec = `[${snapshot.fastState.slice(0, 256).join(',')}]`;
    const slowVec = `[${snapshot.slowState.slice(0, 256).join(',')}]`;
    await this.query(SQL.INSERT_SNAPSHOT, [
      this.agentId,
      snapshot.echobeatsStep,
      snapshot.cycleNumber,
      fastVec,
      slowVec,
      snapshot.energy,
      snapshot.coherence,
      snapshot.aarCoherence,
      snapshot.rlsError ?? null,
    ]);
  }

  // ─── ECAN Attention ────────────────────────────────────────

  async runAttentionCycle(): Promise<{ decayed: number; promoted: number }> {
    const decayResult = await this.query(SQL.DECAY_ATTENTION, [
      this.agentId,
      this.config.attentionDecayRate,
    ]);
    const promoteResult = await this.query(SQL.PROMOTE_ATTENTION, [
      this.agentId,
      this.config.attentionPromotionThreshold,
      0.1,
    ]);
    return {
      decayed: decayResult.rows[0]?.decay_attention ?? 0,
      promoted: promoteResult.rows[0]?.promote_attention ?? 0,
    };
  }

  // ─── Statistics ────────────────────────────────────────────

  async getMemoryStats(): Promise<Record<string, { count: number; avgSti: number; avgStrength: number }>> {
    const result = await this.query(SQL.GET_MEMORY_STATS, [this.agentId]);
    const stats: Record<string, { count: number; avgSti: number; avgStrength: number }> = {};
    for (const row of result.rows) {
      stats[row.subsystem] = {
        count: parseInt(row.atom_count),
        avgSti: parseFloat(row.avg_sti),
        avgStrength: parseFloat(row.avg_strength),
      };
    }
    return stats;
  }

  // ─── Internal Helpers ──────────────────────────────────────

  private async query(sql: string, params: any[] = []): Promise<any> {
    if (!this.pool) {
      throw new Error('HypergraphMemoryStore not initialized — call initialize() first');
    }
    try {
      return await this.pool.query(sql, params);
    } catch (err) {
      this.emit('error', err);
      throw err;
    }
  }

  private async syncPendingAtoms(): Promise<void> {
    if (this.pendingAtoms.length === 0) return;
    const batch = this.pendingAtoms.splice(0, 100);
    for (const atom of batch) {
      try {
        if (atom.kind === 'node') {
          await this.addNode(atom.atomType, atom.name!, {
            tv: atom.truthValue,
            av: atom.attentionValue,
            subsystem: atom.subsystem,
            embedding: atom.embedding,
            valence: atom.valence,
            arousal: atom.arousal,
            metadata: atom.metadata,
          });
        }
      } catch (err) {
        this.emit('sync_error', { atom, error: err });
      }
    }
  }

  private extractConcepts(text: string): string[] {
    // Simple concept extraction: capitalize words > 3 chars, deduplicate
    const words = text.split(/\s+/)
      .filter((w) => w.length > 3)
      .map((w) => w.replace(/[^a-zA-Z0-9-]/g, ''))
      .filter((w) => w.length > 3 && w[0] === w[0].toUpperCase());
    return [...new Set(words)].slice(0, 20);
  }

  private rowToAtom(row: any): HypergraphAtom {
    return {
      atomId: row.atom_id,
      agentId: row.agent_id,
      kind: row.kind,
      atomType: row.atom_type,
      name: row.name,
      outgoing: row.outgoing,
      truthValue: { strength: row.tv_strength, confidence: row.tv_confidence },
      attentionValue: { sti: row.av_sti, lti: row.av_lti, vlti: row.av_vlti },
      subsystem: row.subsystem,
      valence: row.valence,
      arousal: row.arousal,
      metadata: row.metadata,
    };
  }

  private rowToEpisode(row: any): Episode {
    return {
      episodeId: row.episode_id,
      agentId: row.agent_id,
      episodeType: row.episode_type,
      title: row.title,
      summary: row.summary,
      startedAt: new Date(row.started_at),
      endedAt: row.ended_at ? new Date(row.ended_at) : undefined,
      avgValence: row.avg_valence,
      avgArousal: row.avg_arousal,
      echobeatsStep: row.echobeats_step,
      reservoirEnergy: row.reservoir_energy,
      coherence: row.coherence,
      messages: row.messages,
      metadata: row.metadata,
    };
  }

  // ─── Accessors ─────────────────────────────────────────────

  getAgentId(): string | null { return this.agentId; }
  isRunning(): boolean { return this.running; }
}
