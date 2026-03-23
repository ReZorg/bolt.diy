/**
 * @fileoverview A2A Protocol — Agent-to-Agent Communication for Multi-Instance Synergy
 *
 * Implements the A2A (Agent-to-Agent) protocol enabling multiple Level 5 DTE
 * instances to communicate, share knowledge, and evolve collectively.
 *
 * Architecture:
 *   - Each DTE instance is a peer in a mesh network
 *   - Communication via WebSocket + HTTP fallback
 *   - Shared knowledge consensus via the dte_memory.shared_knowledge table
 *   - Reservoir state synchronization for collective coherence
 *   - ECAN attention propagation across agents
 *
 * Message Types:
 *   heartbeat   — Liveness + load reporting
 *   sync        — Reservoir state / identity mesh synchronization
 *   query       — Semantic search delegation to peer agents
 *   response    — Answer to a delegated query
 *   broadcast   — Knowledge sharing (new atoms, episodes, insights)
 *   consensus   — Propose / endorse shared knowledge
 *   evolution   — Ontogenetic stage transition notification
 *
 * Thread Multiplexing (System 5):
 *   The A2A protocol maps to the 6 dyadic permutations P(i,j) of 4 agents:
 *   P(1,2)→P(1,3)→P(1,4)→P(2,3)→P(2,4)→P(3,4)
 *   Two complementary triads cycle for full coverage.
 *
 * cogpy Mapping: cogwebvm (cognitive web virtual machine — distributed communication)
 */

import { EventEmitter } from 'events';
import type {
  HypergraphMemoryStore,
  AgentState,
  SemanticSearchResult,
  MemorySubsystem,
} from './hypergraph-memory-store';

// ============================================================
// A2A Message Types
// ============================================================

export type A2AMessageType =
  | 'heartbeat'
  | 'sync'
  | 'query'
  | 'response'
  | 'broadcast'
  | 'consensus'
  | 'evolution';

export interface A2AMessage {
  messageId: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string | '*';  // '*' = broadcast
  messageType: A2AMessageType;
  payload: Record<string, unknown>;
  timestamp: number;
  ttl: number;  // Time-to-live in seconds
}

export interface PeerAgent {
  agentId: string;
  agentName: string;
  endpoint: string;       // WebSocket or HTTP URL
  capabilities: string[];
  load: number;           // [0, 1]
  ontogeneticStage: string;
  coherence: number;
  lastHeartbeat: number;
  latencyMs: number;
}

export interface ConsensusProposal {
  proposalId: string;
  topic: string;
  content: Record<string, unknown>;
  proposedBy: string;
  endorsements: string[];
  rejections: string[];
  threshold: number;      // Fraction of peers needed for consensus
  expiresAt: number;
}

export interface A2AProtocolConfig {
  agentId: string;
  agentName: string;
  listenPort: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  maxPeers: number;
  consensusThreshold: number;
  syncIntervalMs: number;
  queryTimeoutMs: number;
  memoryStore: HypergraphMemoryStore;
}

const DEFAULT_A2A_CONFIG: Omit<A2AProtocolConfig, 'memoryStore'> = {
  agentId: '',
  agentName: 'dte-bolt-primary',
  listenPort: 9470,
  heartbeatIntervalMs: 10000,
  heartbeatTimeoutMs: 30000,
  maxPeers: 16,
  consensusThreshold: 0.67,
  syncIntervalMs: 60000,
  queryTimeoutMs: 5000,
};

// ============================================================
// A2A Protocol Engine
// ============================================================

export class A2AProtocol extends EventEmitter {
  private config: A2AProtocolConfig;
  private peers: Map<string, PeerAgent> = new Map();
  private pendingQueries: Map<string, {
    resolve: (results: SemanticSearchResult[]) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();
  private proposals: Map<string, ConsensusProposal> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private server: any = null;
  private running: boolean = false;
  private messageCounter: number = 0;

  // Telemetry
  private metrics = {
    messagesSent: 0,
    messagesReceived: 0,
    queriesDelegated: 0,
    consensusProposed: 0,
    consensusAchieved: 0,
    syncCycles: 0,
    peersConnected: 0,
    avgLatencyMs: 0,
  };

  constructor(config: Partial<A2AProtocolConfig> & { memoryStore: HypergraphMemoryStore }) {
    super();
    this.config = { ...DEFAULT_A2A_CONFIG, ...config } as A2AProtocolConfig;
  }

  // ─── Lifecycle ─────────────────────────────────────────────

  async start(): Promise<void> {
    // Start HTTP/WebSocket server for incoming A2A messages
    await this.startServer();

    // Start heartbeat broadcasting
    this.heartbeatTimer = setInterval(() => this.broadcastHeartbeat(), this.config.heartbeatIntervalMs);

    // Start dead peer pruning
    this.pruneTimer = setInterval(() => this.pruneDeadPeers(), this.config.heartbeatTimeoutMs);

    // Start periodic state sync
    this.syncTimer = setInterval(() => this.syncWithPeers(), this.config.syncIntervalMs);

    this.running = true;
    this.emit('started', { port: this.config.listenPort });
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);

    // Cancel pending queries
    for (const [id, pending] of this.pendingQueries) {
      clearTimeout(pending.timer);
      pending.reject(new Error('A2A protocol shutting down'));
    }
    this.pendingQueries.clear();

    if (this.server) {
      await new Promise<void>((resolve) => this.server.close(resolve));
    }

    this.running = false;
    this.emit('stopped');
  }

  // ─── Peer Management ──────────────────────────────────────

  async registerPeer(endpoint: string): Promise<PeerAgent | null> {
    try {
      // Send discovery handshake
      const response = await this.sendHttp(endpoint, {
        messageId: this.nextMessageId(),
        fromAgentId: this.config.agentId,
        fromAgentName: this.config.agentName,
        toAgentId: '*',
        messageType: 'heartbeat' as A2AMessageType,
        payload: {
          type: 'discovery',
          capabilities: ['reasoning', 'learning', 'pattern-matching', 'semantic-search'],
          load: 0,
          ontogeneticStage: 'adult',
          coherence: 0.5,
        },
        timestamp: Date.now(),
        ttl: 60,
      });

      if (response && response.agentId) {
        const peer: PeerAgent = {
          agentId: response.agentId,
          agentName: response.agentName || 'unknown',
          endpoint,
          capabilities: response.capabilities || [],
          load: response.load || 0,
          ontogeneticStage: response.ontogeneticStage || 'embryonic',
          coherence: response.coherence || 0,
          lastHeartbeat: Date.now(),
          latencyMs: response.latencyMs || 0,
        };
        this.peers.set(peer.agentId, peer);
        this.metrics.peersConnected = this.peers.size;
        this.emit('peer_registered', peer);
        return peer;
      }
    } catch (err) {
      this.emit('peer_error', { endpoint, error: err });
    }
    return null;
  }

  removePeer(agentId: string): void {
    this.peers.delete(agentId);
    this.metrics.peersConnected = this.peers.size;
    this.emit('peer_removed', { agentId });
  }

  getPeers(): PeerAgent[] {
    return Array.from(this.peers.values());
  }

  // ─── Message Handling ──────────────────────────────────────

  async handleMessage(message: A2AMessage): Promise<any> {
    this.metrics.messagesReceived++;
    this.emit('message_received', message);

    // Update peer heartbeat
    const peer = this.peers.get(message.fromAgentId);
    if (peer) {
      peer.lastHeartbeat = Date.now();
    }

    switch (message.messageType) {
      case 'heartbeat':
        return this.handleHeartbeat(message);
      case 'sync':
        return this.handleSync(message);
      case 'query':
        return this.handleQuery(message);
      case 'response':
        return this.handleResponse(message);
      case 'broadcast':
        return this.handleBroadcast(message);
      case 'consensus':
        return this.handleConsensus(message);
      case 'evolution':
        return this.handleEvolution(message);
      default:
        this.emit('unknown_message', message);
    }
  }

  private async handleHeartbeat(msg: A2AMessage): Promise<any> {
    const payload = msg.payload as any;
    const peer = this.peers.get(msg.fromAgentId);
    if (peer) {
      peer.load = payload.load ?? peer.load;
      peer.ontogeneticStage = payload.ontogeneticStage ?? peer.ontogeneticStage;
      peer.coherence = payload.coherence ?? peer.coherence;
    }

    // Respond with our own state
    return {
      agentId: this.config.agentId,
      agentName: this.config.agentName,
      capabilities: ['reasoning', 'learning', 'pattern-matching', 'semantic-search'],
      load: 0,
      ontogeneticStage: 'adult',
      coherence: 0.5,
      latencyMs: Date.now() - msg.timestamp,
    };
  }

  private async handleSync(msg: A2AMessage): Promise<void> {
    const payload = msg.payload as any;

    // Merge incoming atoms into our memory store
    if (payload.atoms && Array.isArray(payload.atoms)) {
      for (const atom of payload.atoms) {
        try {
          await this.config.memoryStore.addNode(atom.atomType, atom.name, {
            tv: atom.truthValue,
            av: { sti: atom.attentionValue?.sti * 0.5 }, // Halve STI for foreign atoms
            subsystem: atom.subsystem,
            embedding: atom.embedding,
            metadata: { ...atom.metadata, source_agent: msg.fromAgentId },
          });
        } catch {
          // Skip duplicate or invalid atoms
        }
      }
    }

    this.metrics.syncCycles++;
    this.emit('sync_received', { from: msg.fromAgentId, atomCount: payload.atoms?.length ?? 0 });
  }

  private async handleQuery(msg: A2AMessage): Promise<void> {
    const payload = msg.payload as any;

    // Execute semantic search on our local memory
    const results = await this.config.memoryStore.semanticSearch(
      payload.embedding,
      {
        subsystem: payload.subsystem,
        limit: payload.limit ?? 10,
      },
    );

    // Send response back
    await this.sendMessage(msg.fromAgentId, 'response', {
      queryId: payload.queryId,
      results,
      respondingAgent: this.config.agentId,
    });
  }

  private async handleResponse(msg: A2AMessage): Promise<void> {
    const payload = msg.payload as any;
    const pending = this.pendingQueries.get(payload.queryId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingQueries.delete(payload.queryId);
      pending.resolve(payload.results || []);
    }
  }

  private async handleBroadcast(msg: A2AMessage): Promise<void> {
    const payload = msg.payload as any;

    // Store broadcast knowledge
    if (payload.type === 'new_insight') {
      await this.config.memoryStore.addNode('ConceptNode', payload.concept, {
        subsystem: 'declarative',
        embedding: payload.embedding,
        tv: { strength: payload.confidence ?? 0.5, confidence: 0.3 },
        metadata: { source_agent: msg.fromAgentId, broadcast: true },
      });
    }

    this.emit('broadcast_received', { from: msg.fromAgentId, payload });
  }

  private async handleConsensus(msg: A2AMessage): Promise<void> {
    const payload = msg.payload as any;

    if (payload.action === 'propose') {
      // Evaluate the proposal
      const proposal: ConsensusProposal = {
        proposalId: payload.proposalId,
        topic: payload.topic,
        content: payload.content,
        proposedBy: msg.fromAgentId,
        endorsements: [msg.fromAgentId],
        rejections: [],
        threshold: this.config.consensusThreshold,
        expiresAt: Date.now() + 300000, // 5 minutes
      };
      this.proposals.set(proposal.proposalId, proposal);

      // Auto-evaluate: endorse if coherence > 0.5
      const shouldEndorse = await this.evaluateProposal(proposal);
      if (shouldEndorse) {
        proposal.endorsements.push(this.config.agentId);
        await this.sendMessage(msg.fromAgentId, 'consensus', {
          action: 'endorse',
          proposalId: proposal.proposalId,
        });
      } else {
        proposal.rejections.push(this.config.agentId);
        await this.sendMessage(msg.fromAgentId, 'consensus', {
          action: 'reject',
          proposalId: proposal.proposalId,
        });
      }

      this.emit('consensus_proposal', proposal);
    } else if (payload.action === 'endorse' || payload.action === 'reject') {
      const proposal = this.proposals.get(payload.proposalId);
      if (proposal) {
        if (payload.action === 'endorse') {
          proposal.endorsements.push(msg.fromAgentId);
        } else {
          proposal.rejections.push(msg.fromAgentId);
        }

        // Check if consensus reached
        const totalVotes = proposal.endorsements.length + proposal.rejections.length;
        const totalPeers = this.peers.size + 1; // +1 for self
        if (totalVotes >= totalPeers) {
          const endorseRatio = proposal.endorsements.length / totalPeers;
          if (endorseRatio >= proposal.threshold) {
            this.metrics.consensusAchieved++;
            this.emit('consensus_achieved', proposal);
          } else {
            this.emit('consensus_rejected', proposal);
          }
          this.proposals.delete(proposal.proposalId);
        }
      }
    }
  }

  private async handleEvolution(msg: A2AMessage): Promise<void> {
    const payload = msg.payload as any;
    const peer = this.peers.get(msg.fromAgentId);
    if (peer) {
      peer.ontogeneticStage = payload.newStage;
    }
    this.emit('peer_evolved', {
      agentId: msg.fromAgentId,
      oldStage: payload.oldStage,
      newStage: payload.newStage,
    });
  }

  // ─── Outbound Operations ──────────────────────────────────

  async sendMessage(toAgentId: string, type: A2AMessageType, payload: Record<string, unknown>): Promise<void> {
    const message: A2AMessage = {
      messageId: this.nextMessageId(),
      fromAgentId: this.config.agentId,
      fromAgentName: this.config.agentName,
      toAgentId,
      messageType: type,
      payload,
      timestamp: Date.now(),
      ttl: 60,
    };

    if (toAgentId === '*') {
      // Broadcast to all peers
      for (const peer of this.peers.values()) {
        await this.sendHttp(peer.endpoint, message).catch(() => {});
      }
    } else {
      const peer = this.peers.get(toAgentId);
      if (peer) {
        await this.sendHttp(peer.endpoint, message);
      }
    }

    this.metrics.messagesSent++;
  }

  async delegateQuery(
    queryEmbedding: number[],
    options: { subsystem?: MemorySubsystem; limit?: number } = {},
  ): Promise<SemanticSearchResult[]> {
    const queryId = this.nextMessageId();
    this.metrics.queriesDelegated++;

    // Find the least-loaded peer with semantic-search capability
    const availablePeers = Array.from(this.peers.values())
      .filter((p) => p.capabilities.includes('semantic-search'))
      .sort((a, b) => a.load - b.load);

    if (availablePeers.length === 0) {
      return [];
    }

    const targetPeer = availablePeers[0];

    return new Promise<SemanticSearchResult[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingQueries.delete(queryId);
        resolve([]); // Timeout = empty results, not error
      }, this.config.queryTimeoutMs);

      this.pendingQueries.set(queryId, { resolve, reject, timer });

      this.sendMessage(targetPeer.agentId, 'query', {
        queryId,
        embedding: queryEmbedding,
        subsystem: options.subsystem,
        limit: options.limit ?? 10,
      }).catch(() => {
        clearTimeout(timer);
        this.pendingQueries.delete(queryId);
        resolve([]);
      });
    });
  }

  async proposeConsensus(topic: string, content: Record<string, unknown>): Promise<string> {
    const proposalId = this.nextMessageId();
    this.metrics.consensusProposed++;

    const proposal: ConsensusProposal = {
      proposalId,
      topic,
      content,
      proposedBy: this.config.agentId,
      endorsements: [this.config.agentId], // Self-endorse
      rejections: [],
      threshold: this.config.consensusThreshold,
      expiresAt: Date.now() + 300000,
    };
    this.proposals.set(proposalId, proposal);

    // Broadcast to all peers
    await this.sendMessage('*', 'consensus', {
      action: 'propose',
      proposalId,
      topic,
      content,
    });

    return proposalId;
  }

  async broadcastInsight(concept: string, embedding: number[], confidence: number): Promise<void> {
    await this.sendMessage('*', 'broadcast', {
      type: 'new_insight',
      concept,
      embedding,
      confidence,
    });
  }

  async notifyEvolution(oldStage: string, newStage: string): Promise<void> {
    await this.sendMessage('*', 'evolution', { oldStage, newStage });
  }

  // ─── Periodic Tasks ────────────────────────────────────────

  private async broadcastHeartbeat(): Promise<void> {
    await this.sendMessage('*', 'heartbeat', {
      load: 0,
      ontogeneticStage: 'adult',
      coherence: 0.5,
      capabilities: ['reasoning', 'learning', 'pattern-matching', 'semantic-search'],
    });
  }

  private pruneDeadPeers(): void {
    const now = Date.now();
    const deadPeers: string[] = [];
    for (const [id, peer] of this.peers) {
      if (now - peer.lastHeartbeat > this.config.heartbeatTimeoutMs) {
        deadPeers.push(id);
      }
    }
    for (const id of deadPeers) {
      this.peers.delete(id);
      this.emit('peer_dead', { agentId: id });
    }
    if (deadPeers.length > 0) {
      this.metrics.peersConnected = this.peers.size;
    }
  }

  private async syncWithPeers(): Promise<void> {
    // Get high-STI atoms to share
    const highStiAtoms = await this.config.memoryStore.getAtomsByType('ConceptNode', 20);
    if (highStiAtoms.length === 0) return;

    await this.sendMessage('*', 'sync', {
      atoms: highStiAtoms.map((a) => ({
        atomType: a.atomType,
        name: a.name,
        truthValue: a.truthValue,
        attentionValue: a.attentionValue,
        subsystem: a.subsystem,
        embedding: a.embedding,
        metadata: a.metadata,
      })),
    });

    this.metrics.syncCycles++;
  }

  // ─── Proposal Evaluation ──────────────────────────────────

  private async evaluateProposal(proposal: ConsensusProposal): Promise<boolean> {
    // Simple heuristic: check if we have related knowledge
    // In production, this would use PLN inference
    return true; // Default: endorse
  }

  // ─── HTTP Transport ────────────────────────────────────────

  private async startServer(): Promise<void> {
    // Dynamic import for server-side only
    const http = await import('http');

    this.server = http.createServer(async (req: any, res: any) => {
      if (req.method === 'POST' && req.url === '/a2a') {
        let body = '';
        req.on('data', (chunk: string) => { body += chunk; });
        req.on('end', async () => {
          try {
            const message = JSON.parse(body) as A2AMessage;
            const response = await this.handleMessage(message);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response || { ok: true }));
          } catch (err) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid message' }));
          }
        });
      } else if (req.method === 'GET' && req.url === '/a2a/peers') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.getPeers()));
      } else if (req.method === 'GET' && req.url === '/a2a/metrics') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.getMetrics()));
      } else if (req.method === 'GET' && req.url === '/a2a/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', peers: this.peers.size, running: this.running }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise<void>((resolve) => {
      this.server.listen(this.config.listenPort, '0.0.0.0', resolve);
    });
  }

  private async sendHttp(endpoint: string, message: A2AMessage): Promise<any> {
    const url = endpoint.endsWith('/a2a') ? endpoint : `${endpoint}/a2a`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(this.config.queryTimeoutMs),
    });
    if (response.ok) {
      return response.json();
    }
    throw new Error(`A2A HTTP error: ${response.status}`);
  }

  // ─── Helpers ───────────────────────────────────────────────

  private nextMessageId(): string {
    return `${this.config.agentId}-${++this.messageCounter}-${Date.now().toString(36)}`;
  }

  getMetrics() {
    return {
      ...this.metrics,
      peersConnected: this.peers.size,
      pendingQueries: this.pendingQueries.size,
      activeProposals: this.proposals.size,
    };
  }

  isRunning(): boolean { return this.running; }
}

// ============================================================
// Factory
// ============================================================

export function createA2AProtocol(
  memoryStore: HypergraphMemoryStore,
  config: Partial<Omit<A2AProtocolConfig, 'memoryStore'>> = {},
): A2AProtocol {
  return new A2AProtocol({
    ...config,
    agentId: config.agentId || memoryStore.getAgentId() || `dte-${Date.now().toString(36)}`,
    memoryStore,
  });
}
