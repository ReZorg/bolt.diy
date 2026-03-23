-- ═══════════════════════════════════════════════════════════════════
-- DTE Hypergraph Memory Schema — Neon PostgreSQL + pgvector
-- ═══════════════════════════════════════════════════════════════════
-- 
-- Implements the OpenCog AtomSpace data model in PostgreSQL:
--   - Atoms (nodes + links) with TruthValues and AttentionValues
--   - pgvector embeddings for semantic similarity search
--   - 4 memory subsystems: Declarative, Procedural, Episodic, Intentional
--   - Agent identity mesh persistence
--   - Multi-agent support with agent_id partitioning
--   - A2A protocol message log
--
-- Schema: dte_memory
-- ═══════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS dte_memory;

-- ─── 1. Atom Types Enum ──────────────────────────────────────────

CREATE TYPE dte_memory.atom_kind AS ENUM ('node', 'link');

CREATE TYPE dte_memory.atom_type AS ENUM (
  -- Node types
  'ConceptNode', 'PredicateNode', 'VariableNode', 'NumberNode',
  'SchemaNode', 'GroundedSchemaNode', 'TypeNode',
  'AnchorNode', 'TimeNode', 'AgentNode',
  -- Link types
  'ListLink', 'InheritanceLink', 'SimilarityLink',
  'ImplicationLink', 'EvaluationLink', 'ExecutionLink',
  'MemberLink', 'ContextLink', 'DefineLink',
  'BindLink', 'SatisfactionLink', 'StateLink',
  -- DTE-specific types
  'AARLink', 'ReservoirStateLink', 'IdentityLink',
  'EpisodicLink', 'ProceduralLink', 'IntentionalLink',
  'EmotionalLink', 'CausalLink'
);

CREATE TYPE dte_memory.memory_subsystem AS ENUM (
  'declarative',   -- Facts, concepts, relationships
  'procedural',    -- Skills, action sequences, learned behaviors
  'episodic',      -- Events, conversations, temporal sequences
  'intentional'    -- Goals, plans, desires
);

CREATE TYPE dte_memory.ontogenetic_stage AS ENUM (
  'embryonic', 'infant', 'child', 'adolescent', 'adult', 'elder'
);

-- ─── 2. Agents Table (Multi-Agent Support) ──────────────────────

CREATE TABLE dte_memory.agents (
  agent_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name      TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Identity state
  ontogenetic_stage  dte_memory.ontogenetic_stage NOT NULL DEFAULT 'embryonic',
  interaction_count  BIGINT NOT NULL DEFAULT 0,
  coherence          FLOAT NOT NULL DEFAULT 0.5,
  
  -- AAR state (serialized)
  agent_state     JSONB NOT NULL DEFAULT '{}',
  arena_state     JSONB NOT NULL DEFAULT '{}',
  relation_state  JSONB NOT NULL DEFAULT '{}',
  
  -- Reservoir state snapshot
  reservoir_state JSONB NOT NULL DEFAULT '{}',
  
  -- RLS learner state
  learner_state   JSONB NOT NULL DEFAULT '{}',
  
  -- Self-modification history
  modification_state JSONB NOT NULL DEFAULT '{}',
  
  -- Metadata
  metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_agents_name ON dte_memory.agents(agent_name);
CREATE INDEX idx_agents_stage ON dte_memory.agents(ontogenetic_stage);

-- ─── 3. Atoms Table (Hypergraph Nodes + Links) ─────────────────

CREATE TABLE dte_memory.atoms (
  atom_id         BIGSERIAL PRIMARY KEY,
  agent_id        UUID NOT NULL REFERENCES dte_memory.agents(agent_id) ON DELETE CASCADE,
  
  -- Atom identity
  kind            dte_memory.atom_kind NOT NULL,
  atom_type       dte_memory.atom_type NOT NULL,
  name            TEXT,                          -- For nodes
  outgoing        BIGINT[],                      -- For links: array of atom_ids
  
  -- Truth Value (OpenCog standard)
  tv_strength     FLOAT NOT NULL DEFAULT 1.0,    -- [0, 1]
  tv_confidence   FLOAT NOT NULL DEFAULT 1.0,    -- [0, 1]
  
  -- Attention Value (ECAN)
  av_sti          FLOAT NOT NULL DEFAULT 0.0,    -- Short-term importance
  av_lti          FLOAT NOT NULL DEFAULT 0.0,    -- Long-term importance
  av_vlti         FLOAT NOT NULL DEFAULT 0.0,    -- Very long-term importance
  
  -- Memory subsystem classification
  subsystem       dte_memory.memory_subsystem NOT NULL DEFAULT 'declarative',
  
  -- pgvector embedding (384-dim for all-MiniLM-L6-v2 or 1024 for larger models)
  embedding       vector(384),
  
  -- Emotional valence (from virtual endocrine system)
  valence         FLOAT DEFAULT 0.0,             -- [-1, 1]
  arousal         FLOAT DEFAULT 0.0,             -- [0, 1]
  
  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accessed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  metadata        JSONB NOT NULL DEFAULT '{}'
);

-- Indices for fast lookup
CREATE INDEX idx_atoms_agent ON dte_memory.atoms(agent_id);
CREATE INDEX idx_atoms_type ON dte_memory.atoms(atom_type);
CREATE INDEX idx_atoms_name ON dte_memory.atoms(name) WHERE name IS NOT NULL;
CREATE INDEX idx_atoms_subsystem ON dte_memory.atoms(agent_id, subsystem);
CREATE INDEX idx_atoms_sti ON dte_memory.atoms(agent_id, av_sti DESC);
CREATE INDEX idx_atoms_name_trgm ON dte_memory.atoms USING gin(name gin_trgm_ops) WHERE name IS NOT NULL;

-- pgvector index for semantic similarity search
CREATE INDEX idx_atoms_embedding ON dte_memory.atoms 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- GIN index on outgoing array for link traversal
CREATE INDEX idx_atoms_outgoing ON dte_memory.atoms USING gin(outgoing) WHERE outgoing IS NOT NULL;

-- ─── 4. Episodic Memory (Conversations + Events) ────────────────

CREATE TABLE dte_memory.episodes (
  episode_id      BIGSERIAL PRIMARY KEY,
  agent_id        UUID NOT NULL REFERENCES dte_memory.agents(agent_id) ON DELETE CASCADE,
  
  -- Episode identity
  episode_type    TEXT NOT NULL DEFAULT 'conversation',  -- conversation, observation, reflection
  title           TEXT,
  summary         TEXT,
  
  -- Temporal bounds
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  
  -- Emotional context
  avg_valence     FLOAT DEFAULT 0.0,
  avg_arousal     FLOAT DEFAULT 0.0,
  
  -- Cognitive state at time of episode
  echobeats_step  BIGINT,
  reservoir_energy FLOAT,
  coherence       FLOAT,
  
  -- Embedding of the episode summary
  embedding       vector(384),
  
  -- Full episode data
  messages        JSONB NOT NULL DEFAULT '[]',
  
  -- Metadata
  metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_episodes_agent ON dte_memory.episodes(agent_id);
CREATE INDEX idx_episodes_time ON dte_memory.episodes(agent_id, started_at DESC);
CREATE INDEX idx_episodes_embedding ON dte_memory.episodes 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ─── 5. Procedural Memory (Learned Skills + Patterns) ───────────

CREATE TABLE dte_memory.procedures (
  procedure_id    BIGSERIAL PRIMARY KEY,
  agent_id        UUID NOT NULL REFERENCES dte_memory.agents(agent_id) ON DELETE CASCADE,
  
  -- Procedure identity
  name            TEXT NOT NULL,
  description     TEXT,
  
  -- Skill data
  trigger_pattern TEXT,                          -- When to activate
  action_sequence JSONB NOT NULL DEFAULT '[]',   -- Steps to execute
  success_rate    FLOAT NOT NULL DEFAULT 0.5,    -- [0, 1]
  execution_count BIGINT NOT NULL DEFAULT 0,
  
  -- Learning metadata
  learned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_executed   TIMESTAMPTZ,
  
  -- Embedding for similarity matching
  embedding       vector(384),
  
  -- Metadata
  metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_procedures_agent ON dte_memory.procedures(agent_id);
CREATE INDEX idx_procedures_name ON dte_memory.procedures(agent_id, name);

-- ─── 6. Intentional Memory (Goals + Plans) ──────────────────────

CREATE TABLE dte_memory.intentions (
  intention_id    BIGSERIAL PRIMARY KEY,
  agent_id        UUID NOT NULL REFERENCES dte_memory.agents(agent_id) ON DELETE CASCADE,
  
  -- Intention identity
  goal            TEXT NOT NULL,
  priority        FLOAT NOT NULL DEFAULT 0.5,    -- [0, 1]
  status          TEXT NOT NULL DEFAULT 'active', -- active, achieved, abandoned
  
  -- Plan
  plan_steps      JSONB NOT NULL DEFAULT '[]',
  progress        FLOAT NOT NULL DEFAULT 0.0,    -- [0, 1]
  
  -- Temporal
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline        TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  
  -- Embedding
  embedding       vector(384),
  
  -- Metadata
  metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_intentions_agent ON dte_memory.intentions(agent_id, status);

-- ─── 7. A2A Protocol Messages ───────────────────────────────────

CREATE TABLE dte_memory.a2a_messages (
  message_id      BIGSERIAL PRIMARY KEY,
  
  -- Routing
  from_agent_id   UUID NOT NULL REFERENCES dte_memory.agents(agent_id),
  to_agent_id     UUID NOT NULL REFERENCES dte_memory.agents(agent_id),
  
  -- Message content
  message_type    TEXT NOT NULL,                  -- heartbeat, sync, query, response, broadcast
  payload         JSONB NOT NULL DEFAULT '{}',
  
  -- State
  status          TEXT NOT NULL DEFAULT 'pending', -- pending, delivered, acknowledged, failed
  
  -- Timestamps
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  
  -- Metadata
  metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_a2a_to ON dte_memory.a2a_messages(to_agent_id, status);
CREATE INDEX idx_a2a_from ON dte_memory.a2a_messages(from_agent_id, sent_at DESC);
CREATE INDEX idx_a2a_type ON dte_memory.a2a_messages(message_type, sent_at DESC);

-- ─── 8. Shared Knowledge (Multi-Agent Consensus) ────────────────

CREATE TABLE dte_memory.shared_knowledge (
  knowledge_id    BIGSERIAL PRIMARY KEY,
  
  -- Knowledge identity
  topic           TEXT NOT NULL,
  content         JSONB NOT NULL,
  
  -- Consensus
  proposed_by     UUID NOT NULL REFERENCES dte_memory.agents(agent_id),
  consensus_score FLOAT NOT NULL DEFAULT 0.0,    -- [0, 1]
  endorsements    UUID[] NOT NULL DEFAULT '{}',  -- Array of agent_ids
  
  -- Embedding
  embedding       vector(384),
  
  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_shared_topic ON dte_memory.shared_knowledge(topic);
CREATE INDEX idx_shared_embedding ON dte_memory.shared_knowledge 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ─── 9. Reservoir State Snapshots (Time Series) ─────────────────

CREATE TABLE dte_memory.reservoir_snapshots (
  snapshot_id     BIGSERIAL PRIMARY KEY,
  agent_id        UUID NOT NULL REFERENCES dte_memory.agents(agent_id) ON DELETE CASCADE,
  
  -- Snapshot data
  echobeats_step  BIGINT NOT NULL,
  cycle_number    BIGINT NOT NULL,
  
  -- State vectors (stored as pgvector for efficient similarity)
  fast_state      vector(256),                   -- Reservoir fast state
  slow_state      vector(256),                   -- Reservoir slow state
  
  -- Metrics
  energy          FLOAT NOT NULL,
  coherence       FLOAT NOT NULL,
  aar_coherence   FLOAT NOT NULL,
  rls_error       FLOAT,
  
  -- Timestamp
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_agent ON dte_memory.reservoir_snapshots(agent_id, captured_at DESC);

-- ─── 10. Helper Functions ────────────────────────────────────────

-- Semantic search across atoms
CREATE OR REPLACE FUNCTION dte_memory.semantic_search(
  p_agent_id UUID,
  p_query_embedding vector(384),
  p_subsystem dte_memory.memory_subsystem DEFAULT NULL,
  p_limit INT DEFAULT 10,
  p_min_similarity FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  atom_id BIGINT,
  atom_type dte_memory.atom_type,
  name TEXT,
  similarity FLOAT,
  tv_strength FLOAT,
  av_sti FLOAT,
  subsystem dte_memory.memory_subsystem
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.atom_id,
    a.atom_type,
    a.name,
    1 - (a.embedding <=> p_query_embedding) AS similarity,
    a.tv_strength,
    a.av_sti,
    a.subsystem
  FROM dte_memory.atoms a
  WHERE a.agent_id = p_agent_id
    AND a.embedding IS NOT NULL
    AND (p_subsystem IS NULL OR a.subsystem = p_subsystem)
    AND 1 - (a.embedding <=> p_query_embedding) >= p_min_similarity
  ORDER BY a.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get incoming links for an atom
CREATE OR REPLACE FUNCTION dte_memory.get_incoming(
  p_atom_id BIGINT
)
RETURNS TABLE (
  link_id BIGINT,
  link_type dte_memory.atom_type,
  outgoing BIGINT[],
  tv_strength FLOAT,
  tv_confidence FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.atom_id AS link_id,
    a.atom_type AS link_type,
    a.outgoing,
    a.tv_strength,
    a.tv_confidence
  FROM dte_memory.atoms a
  WHERE p_atom_id = ANY(a.outgoing)
    AND a.kind = 'link';
END;
$$ LANGUAGE plpgsql;

-- ECAN attention decay
CREATE OR REPLACE FUNCTION dte_memory.decay_attention(
  p_agent_id UUID,
  p_decay_rate FLOAT DEFAULT 0.01
)
RETURNS INT AS $$
DECLARE
  affected INT;
BEGIN
  UPDATE dte_memory.atoms
  SET av_sti = GREATEST(0, av_sti - p_decay_rate),
      updated_at = NOW()
  WHERE agent_id = p_agent_id
    AND av_sti > 0;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- Promote STI to LTI for frequently accessed atoms
CREATE OR REPLACE FUNCTION dte_memory.promote_attention(
  p_agent_id UUID,
  p_sti_threshold FLOAT DEFAULT 0.7,
  p_promotion_rate FLOAT DEFAULT 0.1
)
RETURNS INT AS $$
DECLARE
  affected INT;
BEGIN
  UPDATE dte_memory.atoms
  SET av_lti = LEAST(1.0, av_lti + p_promotion_rate),
      updated_at = NOW()
  WHERE agent_id = p_agent_id
    AND av_sti >= p_sti_threshold;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;
