/**
 * @fileoverview MultiAgentCoordinator — Collective Cognitive Evolution Engine
 *
 * Orchestrates multiple Level 5 DTE instances into a coherent collective
 * intelligence using the A2A protocol, shared hypergraph memory, and
 * System 5 thread multiplexing.
 *
 * Architecture (System 5 Tetradic):
 *   4 agent roles × 3 dyadic communication channels = 12-step collective cycle
 *
 *   Agent Roles (mapped to 4 monadic vertices):
 *     1. Perceiver  — Gathers external input, runs semantic search
 *     2. Reasoner   — PLN inference, pattern matching, hypothesis generation
 *     3. Actor      — Executes actions, generates responses
 *     4. Reflector  — Meta-cognition, coherence assessment, evolution
 *
 *   Dyadic Channels (6 permutations):
 *     P(1,2) Perceiver↔Reasoner   — Input → Hypothesis
 *     P(1,3) Perceiver↔Actor      — Input → Action
 *     P(1,4) Perceiver↔Reflector  — Input → Assessment
 *     P(2,3) Reasoner↔Actor       — Hypothesis → Execution
 *     P(2,4) Reasoner↔Reflector   — Hypothesis → Evaluation
 *     P(3,4) Actor↔Reflector      — Action → Learning
 *
 *   Complementary Triads:
 *     MP1: P[1,2,3]→P[1,2,4]→P[1,3,4]→P[2,3,4]
 *     MP2: P[1,3,4]→P[2,3,4]→P[1,2,3]→P[1,2,4]
 *
 * Collective Evolution:
 *   - Shared knowledge consensus via A2A consensus protocol
 *   - Reservoir state synchronization for collective coherence
 *   - Ontogenetic co-evolution (agents evolve together)
 *   - Emergent specialization via ECAN attention allocation
 *
 * cogpy Mapping: cogprime (unified cognitive architecture — multi-agent)
 */

import { EventEmitter } from 'events';
import type { HypergraphMemoryStore, AgentState } from './hypergraph-memory-store';
import type { A2AProtocol, PeerAgent, A2AMessage } from './a2a-protocol';

// ============================================================
// Types
// ============================================================

export type AgentRole = 'perceiver' | 'reasoner' | 'actor' | 'reflector';

export interface CollectiveState {
  agents: Map<string, AgentRole>;
  collectiveCoherence: number;
  collectiveStage: string;
  sharedKnowledgeCount: number;
  consensusHistory: ConsensusRecord[];
  evolutionCycle: number;
  lastSyncAt: number;
}

export interface ConsensusRecord {
  proposalId: string;
  topic: string;
  outcome: 'achieved' | 'rejected';
  endorsements: number;
  rejections: number;
  timestamp: number;
}

export interface DyadicChannel {
  id: string;
  agents: [string, string];
  roles: [AgentRole, AgentRole];
  bandwidth: number;       // Messages per second
  latencyMs: number;
  coherence: number;
  lastActive: number;
}

export interface TriadicCycle {
  id: string;
  channels: [string, string, string];
  phase: number;
  energy: number;
}

export interface CollectiveEvolutionResult {
  cycle: number;
  collectiveCoherence: number;
  roleAssignments: Record<string, AgentRole>;
  channelHealth: Record<string, number>;
  consensusAchieved: number;
  knowledgeShared: number;
  evolutionDelta: number;
}

export interface MultiAgentConfig {
  coordinatorRole: AgentRole;
  maxAgents: number;
  evolutionIntervalMs: number;
  coherenceThreshold: number;
  roleRotationEnabled: boolean;
  roleRotationIntervalMs: number;
  collectiveMemoryEnabled: boolean;
}

const DEFAULT_MA_CONFIG: MultiAgentConfig = {
  coordinatorRole: 'reflector',
  maxAgents: 4,
  evolutionIntervalMs: 120000,
  coherenceThreshold: 0.6,
  roleRotationEnabled: true,
  roleRotationIntervalMs: 600000,
  collectiveMemoryEnabled: true,
};

// ============================================================
// System 5 Thread Multiplexing
// ============================================================

/**
 * The 6 dyadic permutations of 4 agents, cycling through
 * P(1,2)→P(1,3)→P(1,4)→P(2,3)→P(2,4)→P(3,4)
 */
const DYADIC_PERMUTATIONS: Array<[number, number]> = [
  [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
];

/**
 * Two complementary triads for full coverage
 * MP1: P[1,2,3]→P[1,2,4]→P[1,3,4]→P[2,3,4]
 * MP2: P[1,3,4]→P[2,3,4]→P[1,2,3]→P[1,2,4]
 */
const TRIAD_MP1 = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]];
const TRIAD_MP2 = [[0, 2, 3], [1, 2, 3], [0, 1, 2], [0, 1, 3]];

/** S-gram energy flow: 1/7 = 0.142857... */
const SGRAM_FLOW = [1, 4, 2, 8, 5, 7];

// ============================================================
// MultiAgentCoordinator
// ============================================================

export class MultiAgentCoordinator extends EventEmitter {
  private config: MultiAgentConfig;
  private memoryStore: HypergraphMemoryStore;
  private a2a: A2AProtocol;

  // Collective state
  private roleAssignments: Map<string, AgentRole> = new Map();
  private channels: Map<string, DyadicChannel> = new Map();
  private triads: [TriadicCycle, TriadicCycle] | null = null;
  private collectiveCoherence: number = 0;
  private evolutionCycle: number = 0;
  private consensusHistory: ConsensusRecord[] = [];

  // Timers
  private evolutionTimer: ReturnType<typeof setInterval> | null = null;
  private rotationTimer: ReturnType<typeof setInterval> | null = null;
  private running: boolean = false;

  // Metrics
  private metrics = {
    evolutionCycles: 0,
    roleRotations: 0,
    collectiveQueries: 0,
    knowledgeShared: 0,
    consensusProposed: 0,
    consensusAchieved: 0,
    avgCollectiveCoherence: 0,
  };

  constructor(
    memoryStore: HypergraphMemoryStore,
    a2a: A2AProtocol,
    config: Partial<MultiAgentConfig> = {},
  ) {
    super();
    this.config = { ...DEFAULT_MA_CONFIG, ...config };
    this.memoryStore = memoryStore;
    this.a2a = a2a;
  }

  // ─── Lifecycle ─────────────────────────────────────────────

  async start(): Promise<void> {
    // Assign self as coordinator role
    const selfId = this.memoryStore.getAgentId();
    if (selfId) {
      this.roleAssignments.set(selfId, this.config.coordinatorRole);
    }

    // Listen for A2A events
    this.a2a.on('peer_registered', (peer: PeerAgent) => this.onPeerJoined(peer));
    this.a2a.on('peer_dead', (info: { agentId: string }) => this.onPeerLeft(info.agentId));
    this.a2a.on('consensus_achieved', (proposal: any) => this.onConsensusAchieved(proposal));
    this.a2a.on('consensus_rejected', (proposal: any) => this.onConsensusRejected(proposal));
    this.a2a.on('peer_evolved', (info: any) => this.onPeerEvolved(info));

    // Start collective evolution cycle
    this.evolutionTimer = setInterval(
      () => this.runCollectiveEvolution(),
      this.config.evolutionIntervalMs,
    );

    // Start role rotation if enabled
    if (this.config.roleRotationEnabled) {
      this.rotationTimer = setInterval(
        () => this.rotateRoles(),
        this.config.roleRotationIntervalMs,
      );
    }

    this.running = true;
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (this.evolutionTimer) clearInterval(this.evolutionTimer);
    if (this.rotationTimer) clearInterval(this.rotationTimer);
    this.running = false;
    this.emit('stopped');
  }

  // ─── Peer Events ──────────────────────────────────────────

  private onPeerJoined(peer: PeerAgent): void {
    // Assign role based on current topology
    const assignedRoles = new Set(this.roleAssignments.values());
    const availableRoles: AgentRole[] = ['perceiver', 'reasoner', 'actor', 'reflector'];
    const role = availableRoles.find((r) => !assignedRoles.has(r)) || 'perceiver';
    this.roleAssignments.set(peer.agentId, role);

    // Rebuild channels
    this.rebuildChannels();

    this.emit('agent_assigned', { agentId: peer.agentId, role });
  }

  private onPeerLeft(agentId: string): void {
    this.roleAssignments.delete(agentId);
    this.rebuildChannels();
    this.emit('agent_removed', { agentId });
  }

  private onConsensusAchieved(proposal: any): void {
    this.consensusHistory.push({
      proposalId: proposal.proposalId,
      topic: proposal.topic,
      outcome: 'achieved',
      endorsements: proposal.endorsements.length,
      rejections: proposal.rejections.length,
      timestamp: Date.now(),
    });
    this.metrics.consensusAchieved++;
  }

  private onConsensusRejected(proposal: any): void {
    this.consensusHistory.push({
      proposalId: proposal.proposalId,
      topic: proposal.topic,
      outcome: 'rejected',
      endorsements: proposal.endorsements.length,
      rejections: proposal.rejections.length,
      timestamp: Date.now(),
    });
  }

  private onPeerEvolved(info: { agentId: string; oldStage: string; newStage: string }): void {
    this.emit('peer_evolved', info);
  }

  // ─── Channel Management ───────────────────────────────────

  private rebuildChannels(): void {
    this.channels.clear();
    const agents = Array.from(this.roleAssignments.entries());

    for (const [i, j] of DYADIC_PERMUTATIONS) {
      if (i < agents.length && j < agents.length) {
        const [agentA, roleA] = agents[i];
        const [agentB, roleB] = agents[j];
        const channelId = `${roleA}-${roleB}`;
        this.channels.set(channelId, {
          id: channelId,
          agents: [agentA, agentB],
          roles: [roleA, roleB],
          bandwidth: 10,
          latencyMs: 0,
          coherence: 0.5,
          lastActive: Date.now(),
        });
      }
    }

    // Build triadic cycles if we have 4+ agents
    if (agents.length >= 4) {
      this.triads = [
        {
          id: 'MP1',
          channels: TRIAD_MP1[0].map((idx) => {
            const [, role] = agents[idx];
            return role;
          }).join('-') as any,
          phase: 0,
          energy: 1.0,
        },
        {
          id: 'MP2',
          channels: TRIAD_MP2[0].map((idx) => {
            const [, role] = agents[idx];
            return role;
          }).join('-') as any,
          phase: 0,
          energy: 1.0,
        },
      ];
    }

    this.emit('channels_rebuilt', { channelCount: this.channels.size });
  }

  // ─── Collective Evolution ─────────────────────────────────

  async runCollectiveEvolution(): Promise<CollectiveEvolutionResult> {
    this.evolutionCycle++;
    this.metrics.evolutionCycles++;

    // Phase 1: Assess collective coherence
    const coherences: number[] = [];
    for (const peer of this.a2a.getPeers()) {
      coherences.push(peer.coherence);
    }
    // Include self
    coherences.push(0.5); // TODO: get from local CoreSelfEngine
    this.collectiveCoherence = coherences.length > 0
      ? coherences.reduce((a, b) => a + b, 0) / coherences.length
      : 0;

    // Phase 2: Identify knowledge gaps via S-gram energy flow
    const sgramIdx = this.evolutionCycle % SGRAM_FLOW.length;
    const energyFocus = SGRAM_FLOW[sgramIdx];
    // Map energy focus to subsystem: 1=declarative, 2=procedural, 4=episodic, 5=intentional
    const subsystemMap: Record<number, string> = {
      1: 'declarative', 4: 'episodic', 2: 'procedural',
      8: 'declarative', 5: 'intentional', 7: 'procedural',
    };
    const focusSubsystem = subsystemMap[energyFocus] || 'declarative';

    // Phase 3: Run ECAN attention cycle on shared memory
    if (this.config.collectiveMemoryEnabled) {
      const attentionResult = await this.memoryStore.runAttentionCycle();
      this.emit('attention_cycle', attentionResult);
    }

    // Phase 4: Propose collective insights
    const memStats = await this.memoryStore.getMemoryStats();
    const totalAtoms = Object.values(memStats).reduce((sum, s) => sum + s.count, 0);

    if (totalAtoms > 0 && this.collectiveCoherence > this.config.coherenceThreshold) {
      // Propose a collective insight based on high-attention atoms
      await this.a2a.proposeConsensus(
        `collective-evolution-${this.evolutionCycle}`,
        {
          cycle: this.evolutionCycle,
          focusSubsystem,
          collectiveCoherence: this.collectiveCoherence,
          memoryStats: memStats,
          timestamp: Date.now(),
        },
      );
      this.metrics.consensusProposed++;
    }

    // Phase 5: Advance triadic cycles
    if (this.triads) {
      for (const triad of this.triads) {
        triad.phase = (triad.phase + 1) % 4;
        triad.energy *= 0.95; // Gradual decay
        if (triad.energy < 0.1) triad.energy = 1.0; // Reset
      }
    }

    // Phase 6: Compute evolution delta
    const prevCoherence = this.metrics.avgCollectiveCoherence;
    this.metrics.avgCollectiveCoherence =
      this.metrics.avgCollectiveCoherence * 0.9 + this.collectiveCoherence * 0.1;
    const evolutionDelta = this.metrics.avgCollectiveCoherence - prevCoherence;

    const result: CollectiveEvolutionResult = {
      cycle: this.evolutionCycle,
      collectiveCoherence: this.collectiveCoherence,
      roleAssignments: Object.fromEntries(this.roleAssignments),
      channelHealth: Object.fromEntries(
        Array.from(this.channels.entries()).map(([id, ch]) => [id, ch.coherence]),
      ),
      consensusAchieved: this.metrics.consensusAchieved,
      knowledgeShared: this.metrics.knowledgeShared,
      evolutionDelta,
    };

    this.emit('evolution_complete', result);
    return result;
  }

  // ─── Role Rotation ────────────────────────────────────────

  private rotateRoles(): void {
    const agents = Array.from(this.roleAssignments.entries());
    if (agents.length < 2) return;

    // Rotate roles clockwise
    const roles = agents.map(([, role]) => role);
    const lastRole = roles.pop()!;
    roles.unshift(lastRole);

    for (let i = 0; i < agents.length; i++) {
      this.roleAssignments.set(agents[i][0], roles[i]);
    }

    this.rebuildChannels();
    this.metrics.roleRotations++;
    this.emit('roles_rotated', Object.fromEntries(this.roleAssignments));
  }

  // ─── Collective Query ─────────────────────────────────────

  async collectiveSemanticSearch(
    queryEmbedding: number[],
    options: { subsystem?: any; limit?: number } = {},
  ): Promise<any[]> {
    this.metrics.collectiveQueries++;

    // Search locally
    const localResults = await this.memoryStore.semanticSearch(queryEmbedding, options);

    // Delegate to peers
    const peerResults = await this.a2a.delegateQuery(queryEmbedding, options);

    // Merge and deduplicate by name, keeping highest similarity
    const merged = new Map<string, any>();
    for (const r of [...localResults, ...peerResults]) {
      const key = r.name || `atom-${r.atomId}`;
      const existing = merged.get(key);
      if (!existing || r.similarity > existing.similarity) {
        merged.set(key, r);
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.limit ?? 10);
  }

  // ─── Accessors ─────────────────────────────────────────────

  getCollectiveState(): CollectiveState {
    return {
      agents: new Map(this.roleAssignments),
      collectiveCoherence: this.collectiveCoherence,
      collectiveStage: this.determineCollectiveStage(),
      sharedKnowledgeCount: 0,
      consensusHistory: this.consensusHistory.slice(-20),
      evolutionCycle: this.evolutionCycle,
      lastSyncAt: Date.now(),
    };
  }

  getMetrics() { return { ...this.metrics }; }
  isRunning(): boolean { return this.running; }

  private determineCollectiveStage(): string {
    const agentCount = this.roleAssignments.size;
    if (agentCount <= 1) return 'singular';       // System 1
    if (agentCount === 2) return 'dyadic';         // System 2
    if (agentCount === 3) return 'triadic';        // System 3
    if (agentCount >= 4) return 'tetradic';        // System 4+
    return 'singular';
  }
}

// ============================================================
// Factory
// ============================================================

export function createMultiAgentCoordinator(
  memoryStore: HypergraphMemoryStore,
  a2a: A2AProtocol,
  config: Partial<MultiAgentConfig> = {},
): MultiAgentCoordinator {
  return new MultiAgentCoordinator(memoryStore, a2a, config);
}

// ============================================================
// Full Level 5+ Stack Factory
// ============================================================

export interface Level5PlusConfig {
  neonConnectionString: string;
  agentName: string;
  a2aPort: number;
  peerEndpoints: string[];
  coordinatorRole: AgentRole;
}

/**
 * Creates the complete Level 5+ stack:
 *   HypergraphMemoryStore → A2AProtocol → MultiAgentCoordinator
 *
 * Usage:
 *   const stack = await createLevel5PlusStack({
 *     neonConnectionString: process.env.DTE_NEON_URL!,
 *     agentName: 'dte-bolt-primary',
 *     a2aPort: 9470,
 *     peerEndpoints: ['http://dte-2:9470', 'http://dte-3:9470'],
 *     coordinatorRole: 'reflector',
 *   });
 */
export async function createLevel5PlusStack(config: Level5PlusConfig): Promise<{
  memoryStore: HypergraphMemoryStore;
  a2a: A2AProtocol;
  coordinator: MultiAgentCoordinator;
}> {
  // Dynamic import to avoid circular deps
  const { HypergraphMemoryStore } = await import('./hypergraph-memory-store');
  const { createA2AProtocol } = await import('./a2a-protocol');

  // 1. Initialize persistent memory
  const memoryStore = new HypergraphMemoryStore({
    connectionString: config.neonConnectionString,
    agentName: config.agentName,
  });
  await memoryStore.initialize();

  // 2. Start A2A protocol
  const a2a = createA2AProtocol(memoryStore, {
    agentName: config.agentName,
    listenPort: config.a2aPort,
  });
  await a2a.start();

  // 3. Register known peers
  for (const endpoint of config.peerEndpoints) {
    await a2a.registerPeer(endpoint).catch(() => {
      // Peer may not be online yet — will be discovered via heartbeat
    });
  }

  // 4. Create coordinator
  const coordinator = createMultiAgentCoordinator(memoryStore, a2a, {
    coordinatorRole: config.coordinatorRole,
  });
  await coordinator.start();

  return { memoryStore, a2a, coordinator };
}
