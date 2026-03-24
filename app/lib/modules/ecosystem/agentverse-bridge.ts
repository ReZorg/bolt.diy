/**
 * @fileoverview Fetch.ai Agentverse Bridge — Level 6 Ecosystem Integration
 *
 * Connects the DTE A2A protocol to the Fetch.ai Agentverse, enabling:
 *   - Agent registration on the Almanac (decentralized agent directory)
 *   - Discovery of external uAgents by capability/protocol
 *   - Mailbox messaging for asynchronous inter-agent communication
 *   - Identity proving via challenge-response
 *   - Protocol advertisement for DTE cognitive services
 *
 * Architecture:
 *   DTE A2A Protocol ←→ AgentverseBridge ←→ Fetch.ai Agentverse REST API v2
 *
 * Mapping:
 *   DTE Agent Role    → Agentverse Protocol
 *   dte-perceiver     → dte:perception/1.0 (semantic search, input gathering)
 *   dte-reasoner      → dte:reasoning/1.0 (PLN inference, hypothesis)
 *   dte-actor         → dte:action/1.0 (execution, response generation)
 *   dte-reflector     → dte:reflection/1.0 (meta-cognition, evolution)
 *
 * cogpy Mapping: cogplan9 (distributed agent coordination — Plan 9 namespace)
 */

import { EventEmitter } from 'events';

// ============================================================
// Types
// ============================================================

export interface AgentverseConfig {
  apiToken: string;
  baseUrl: string;
  agentName: string;
  agentRole: string;
  protocols: string[];
  mailboxEnabled: boolean;
  heartbeatIntervalMs: number;
  discoveryIntervalMs: number;
}

const DEFAULT_AV_CONFIG: AgentverseConfig = {
  apiToken: '',
  baseUrl: 'https://agentverse.ai/v2',
  agentName: 'dte-bolt',
  agentRole: 'reflector',
  protocols: ['dte:cognitive/1.0'],
  mailboxEnabled: true,
  heartbeatIntervalMs: 60000,
  discoveryIntervalMs: 300000,
};

export interface AgentverseAgent {
  address: string;
  name: string;
  protocols: string[];
  endpoints: string[];
  metadata: Record<string, any>;
  lastSeen: number;
}

export interface AlmanacEntry {
  address: string;
  name: string;
  protocols: string[];
  endpoints: { url: string; weight: number }[];
  expiry: string;
  metadata: Record<string, any>;
}

export interface MailboxMessage {
  sender: string;
  target: string;
  protocol: string;
  payload: Record<string, any>;
  timestamp: number;
  sessionId?: string;
}

export interface IdentityChallenge {
  challengeId: string;
  nonce: string;
  timestamp: number;
}

export interface DiscoveryResult {
  agents: AgentverseAgent[];
  protocol: string;
  totalFound: number;
  timestamp: number;
}

// ============================================================
// DTE Protocol Definitions
// ============================================================

const DTE_PROTOCOLS = {
  cognitive: 'dte:cognitive/1.0',
  perception: 'dte:perception/1.0',
  reasoning: 'dte:reasoning/1.0',
  action: 'dte:action/1.0',
  reflection: 'dte:reflection/1.0',
  memory: 'dte:memory/1.0',
  evolution: 'dte:evolution/1.0',
  a2a: 'dte:a2a/1.0',
} as const;

const ROLE_TO_PROTOCOLS: Record<string, string[]> = {
  perceiver: [DTE_PROTOCOLS.cognitive, DTE_PROTOCOLS.perception, DTE_PROTOCOLS.memory],
  reasoner: [DTE_PROTOCOLS.cognitive, DTE_PROTOCOLS.reasoning, DTE_PROTOCOLS.memory],
  actor: [DTE_PROTOCOLS.cognitive, DTE_PROTOCOLS.action, DTE_PROTOCOLS.a2a],
  reflector: [DTE_PROTOCOLS.cognitive, DTE_PROTOCOLS.reflection, DTE_PROTOCOLS.evolution],
};

// ============================================================
// AgentverseBridge
// ============================================================

export class AgentverseBridge extends EventEmitter {
  private config: AgentverseConfig;
  private agentAddress: string = '';
  private discoveredAgents: Map<string, AgentverseAgent> = new Map();
  private mailboxQueue: MailboxMessage[] = [];
  private running: boolean = false;

  // Timers
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private discoveryTimer: ReturnType<typeof setInterval> | null = null;
  private mailboxPollTimer: ReturnType<typeof setInterval> | null = null;

  // Metrics
  private metrics = {
    messagesReceived: 0,
    messagesSent: 0,
    discoveryRuns: 0,
    agentsDiscovered: 0,
    challengesCompleted: 0,
    errors: 0,
  };

  constructor(config: Partial<AgentverseConfig> = {}) {
    super();
    this.config = { ...DEFAULT_AV_CONFIG, ...config };
    // Auto-assign protocols based on role
    if (!config.protocols) {
      this.config.protocols = ROLE_TO_PROTOCOLS[this.config.agentRole] || [DTE_PROTOCOLS.cognitive];
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────

  async start(): Promise<void> {
    // Step 1: Register agent on Agentverse
    await this.registerAgent();

    // Step 2: Prove identity via challenge-response
    await this.proveIdentity();

    // Step 3: Register on Almanac
    await this.registerOnAlmanac();

    // Step 4: Enable mailbox if configured
    if (this.config.mailboxEnabled) {
      await this.enableMailbox();
    }

    // Step 5: Start periodic tasks
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      this.config.heartbeatIntervalMs,
    );
    this.discoveryTimer = setInterval(
      () => this.runDiscovery(),
      this.config.discoveryIntervalMs,
    );
    if (this.config.mailboxEnabled) {
      this.mailboxPollTimer = setInterval(
        () => this.pollMailbox(),
        15000, // Poll every 15s
      );
    }

    this.running = true;
    this.emit('started', { address: this.agentAddress });
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    if (this.mailboxPollTimer) clearInterval(this.mailboxPollTimer);
    this.running = false;
    this.emit('stopped');
  }

  // ─── Agent Registration ───────────────────────────────────

  private async registerAgent(): Promise<void> {
    const response = await this.apiCall('POST', '/agents', {
      name: this.config.agentName,
      protocols: this.config.protocols,
      metadata: {
        framework: 'deep-tree-echo',
        version: '6.0',
        role: this.config.agentRole,
        capabilities: this.config.protocols,
        system: 'bolt.diy',
      },
    });

    this.agentAddress = response.address || response.agent_address || '';
    this.emit('registered', { address: this.agentAddress });
  }

  private async proveIdentity(): Promise<void> {
    // Step 1: Request challenge
    const challenge = await this.apiCall('POST', `/agents/${this.agentAddress}/challenge`, {});

    // Step 2: Sign challenge with agent key (simplified — in production use ed25519)
    const signature = await this.signChallenge(challenge.nonce);

    // Step 3: Submit proof
    await this.apiCall('POST', `/agents/${this.agentAddress}/prove`, {
      challengeId: challenge.challengeId,
      signature,
    });

    this.metrics.challengesCompleted++;
    this.emit('identity_proven');
  }

  private async signChallenge(nonce: string): Promise<string> {
    // In production, use ed25519 signing with the agent's private key
    // For now, use HMAC-SHA256 with the API token as key
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.config.apiToken),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(nonce));
    return Buffer.from(sig).toString('hex');
  }

  // ─── Almanac Registration ─────────────────────────────────

  private async registerOnAlmanac(): Promise<void> {
    await this.apiCall('POST', '/almanac/register', {
      address: this.agentAddress,
      name: this.config.agentName,
      protocols: this.config.protocols,
      endpoints: [
        {
          url: `https://${this.config.agentName}.agentverse.ai`,
          weight: 1,
        },
      ],
      expiry: new Date(Date.now() + 86400000).toISOString(), // 24h
      metadata: {
        framework: 'deep-tree-echo',
        role: this.config.agentRole,
        level: 6,
        system: 'bolt.diy',
      },
    });

    this.emit('almanac_registered');
  }

  // ─── Mailbox ──────────────────────────────────────────────

  private async enableMailbox(): Promise<void> {
    await this.apiCall('POST', `/agents/${this.agentAddress}/mailbox`, {
      enabled: true,
    });
    this.emit('mailbox_enabled');
  }

  private async pollMailbox(): Promise<void> {
    try {
      const messages = await this.apiCall(
        'GET',
        `/agents/${this.agentAddress}/mailbox/messages`,
      );

      if (messages && Array.isArray(messages.messages)) {
        for (const msg of messages.messages) {
          this.metrics.messagesReceived++;
          const parsed: MailboxMessage = {
            sender: msg.sender,
            target: msg.target || this.agentAddress,
            protocol: msg.protocol || 'unknown',
            payload: msg.payload || {},
            timestamp: msg.timestamp || Date.now(),
            sessionId: msg.session_id,
          };
          this.mailboxQueue.push(parsed);
          this.emit('message_received', parsed);
        }
      }
    } catch (err) {
      this.metrics.errors++;
    }
  }

  async sendMessage(target: string, protocol: string, payload: Record<string, any>): Promise<void> {
    await this.apiCall('POST', `/agents/${this.agentAddress}/mailbox/send`, {
      target,
      protocol,
      payload,
      timestamp: Date.now(),
    });
    this.metrics.messagesSent++;
    this.emit('message_sent', { target, protocol });
  }

  // ─── Discovery ────────────────────────────────────────────

  async runDiscovery(): Promise<DiscoveryResult[]> {
    this.metrics.discoveryRuns++;
    const results: DiscoveryResult[] = [];

    for (const protocol of this.config.protocols) {
      try {
        const response = await this.apiCall('GET', `/almanac/search?protocol=${encodeURIComponent(protocol)}`);

        if (response && Array.isArray(response.agents)) {
          for (const agent of response.agents) {
            if (agent.address !== this.agentAddress) {
              const avAgent: AgentverseAgent = {
                address: agent.address,
                name: agent.name || 'unknown',
                protocols: agent.protocols || [],
                endpoints: (agent.endpoints || []).map((e: any) => e.url),
                metadata: agent.metadata || {},
                lastSeen: Date.now(),
              };
              this.discoveredAgents.set(agent.address, avAgent);
              this.metrics.agentsDiscovered++;
            }
          }

          results.push({
            agents: response.agents.map((a: any) => ({
              address: a.address,
              name: a.name || 'unknown',
              protocols: a.protocols || [],
              endpoints: (a.endpoints || []).map((e: any) => e.url),
              metadata: a.metadata || {},
              lastSeen: Date.now(),
            })),
            protocol,
            totalFound: response.agents.length,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        this.metrics.errors++;
      }
    }

    this.emit('discovery_complete', results);
    return results;
  }

  async resolveAgent(address: string): Promise<AlmanacEntry | null> {
    try {
      const response = await this.apiCall('GET', `/almanac/resolve/${address}`);
      return response as AlmanacEntry;
    } catch {
      return null;
    }
  }

  // ─── Heartbeat ────────────────────────────────────────────

  private async sendHeartbeat(): Promise<void> {
    try {
      await this.apiCall('POST', `/agents/${this.agentAddress}/heartbeat`, {
        timestamp: Date.now(),
        status: 'active',
        metrics: this.metrics,
      });
    } catch {
      this.metrics.errors++;
    }
  }

  // ─── A2A ↔ Agentverse Bridge ─────────────────────────────

  /**
   * Forward an internal A2A message to an external Agentverse agent
   */
  async forwardToAgentverse(
    targetAddress: string,
    a2aMessage: Record<string, any>,
  ): Promise<void> {
    await this.sendMessage(targetAddress, DTE_PROTOCOLS.a2a, {
      type: 'a2a_forward',
      source: this.agentAddress,
      originalMessage: a2aMessage,
      timestamp: Date.now(),
    });
  }

  /**
   * Convert an incoming Agentverse message to A2A format
   */
  convertToA2A(msg: MailboxMessage): Record<string, any> {
    return {
      type: msg.protocol.includes('a2a') ? msg.payload.type || 'broadcast' : 'query',
      agentId: msg.sender,
      agentName: msg.sender,
      payload: msg.payload,
      timestamp: msg.timestamp,
      source: 'agentverse',
    };
  }

  // ─── Accessors ─────────────────────────────────────────────

  getAddress(): string { return this.agentAddress; }
  getDiscoveredAgents(): AgentverseAgent[] { return Array.from(this.discoveredAgents.values()); }
  getPendingMessages(): MailboxMessage[] { return [...this.mailboxQueue]; }
  getMetrics() { return { ...this.metrics }; }
  isRunning(): boolean { return this.running; }

  // ─── HTTP Client ──────────────────────────────────────────

  private async apiCall(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = { method, headers };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Agentverse API ${method} ${path}: ${response.status} ${text}`);
    }

    return response.json().catch(() => ({}));
  }
}

// ============================================================
// Factory
// ============================================================

export function createAgentverseBridge(
  config: Partial<AgentverseConfig> = {},
): AgentverseBridge {
  return new AgentverseBridge(config);
}

export { DTE_PROTOCOLS, ROLE_TO_PROTOCOLS };
