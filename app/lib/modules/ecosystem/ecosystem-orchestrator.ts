/**
 * @fileoverview Level 6 Ecosystem Orchestrator
 *
 * Wires the three ecosystem integrations into a unified cognitive loop:
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │                   EcosystemOrchestrator (Level 6)                  │
 *   │                                                                     │
 *   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
 *   │  │  Agentverse  │  │   Vorticog   │  │     Live2D Embodiment    │ │
 *   │  │   Bridge     │  │  Digital Twin │  │  (Miara/DTE 4K Avatar)  │ │
 *   │  │              │  │              │  │                          │ │
 *   │  │ ←→ Almanac   │  │ ←→ Market    │  │ ←→ FACS Action Units    │ │
 *   │  │ ←→ Mailbox   │  │ ←→ Agents    │  │ ←→ Cubism Parameters    │ │
 *   │  │ ←→ Discovery │  │ ←→ DreamCog  │  │ ←→ Endocrine Pipeline   │ │
 *   │  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────────┘ │
 *   │         │                 │                      │                  │
 *   │         └─────────────────┼──────────────────────┘                  │
 *   │                           │                                         │
 *   │              ┌────────────┴────────────┐                            │
 *   │              │ MultiAgentCoordinator   │                            │
 *   │              │ (Level 5+ Collective)   │                            │
 *   │              └─────────────────────────┘                            │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * Integration Loop (per Echobeats cycle):
 *   1. Perceiver polls Agentverse for external agent messages
 *   2. Reasoner analyzes Vorticog market data + external insights
 *   3. Actor executes Vorticog trades + responds to Agentverse queries
 *   4. Reflector updates Live2D avatar expression from collective state
 *   5. Collective evolution feedback → all three ecosystems
 *
 * cogpy Mapping: cogprime (unified cognitive architecture — all subsystems)
 */

import { EventEmitter } from 'events';
import type { AgentverseBridge } from './agentverse-bridge';
import type { VorticogTwin } from './vorticog-twin';
import type { Live2DEmbodiment } from './live2d-embodiment';

// ============================================================
// Types
// ============================================================

export interface EcosystemConfig {
  agentverse: {
    enabled: boolean;
    apiToken: string;
    agentName: string;
    agentRole: string;
  };
  vorticog: {
    enabled: boolean;
    apiBaseUrl: string;
    companyId: number;
    worldId: number;
  };
  live2d: {
    enabled: boolean;
    modelPath: string;
    wsPort: number;
  };
  integrationLoopMs: number;
  feedbackEnabled: boolean;
}

const DEFAULT_ECO_CONFIG: EcosystemConfig = {
  agentverse: {
    enabled: true,
    apiToken: '',
    agentName: 'dte-bolt',
    agentRole: 'reflector',
  },
  vorticog: {
    enabled: true,
    apiBaseUrl: 'http://localhost:5173/api',
    companyId: 1,
    worldId: 1,
  },
  live2d: {
    enabled: true,
    modelPath: '/assets/models/dte-miara/dte-miara.model3.json',
    wsPort: 9480,
  },
  integrationLoopMs: 30000,
  feedbackEnabled: true,
};

export interface EcosystemState {
  agentverseConnected: boolean;
  agentverseAgentCount: number;
  vorticogConnected: boolean;
  vorticogCompanyCash: number;
  live2dActive: boolean;
  live2dExpression: string;
  integrationCycles: number;
  lastCycleAt: number;
}

export interface IntegrationCycleResult {
  cycle: number;
  agentverseMessages: number;
  vorticogDecisions: number;
  live2dExpressionChange: boolean;
  feedbackScore: number;
  timestamp: number;
}

// ============================================================
// EcosystemOrchestrator
// ============================================================

export class EcosystemOrchestrator extends EventEmitter {
  private config: EcosystemConfig;
  private agentverse: AgentverseBridge | null = null;
  private vorticog: VorticogTwin | null = null;
  private live2d: Live2DEmbodiment | null = null;

  private running: boolean = false;
  private cycleCount: number = 0;
  private loopTimer: ReturnType<typeof setInterval> | null = null;

  // Cognitive state bridge (from MultiAgentCoordinator)
  private cognitiveState = {
    endocrine: {
      valence: 0, arousal: 0.3, dominance: 0.5,
      cortisol: 0.2, dopamine: 0.5, oxytocin: 0.3, serotonin: 0.5,
    },
    aarState: {
      agentActivation: 0.5,
      arenaStability: 0.7,
      relationCoherence: 0.5,
      reservoirEntropy: 0.4,
    },
    echobeatsPhase: 0,
    collectiveCoherence: 0.5,
    ontogeneticStage: 'formal',
  };

  // Metrics
  private metrics = {
    integrationCycles: 0,
    agentverseMessagesProcessed: 0,
    vorticogDecisionsExecuted: 0,
    live2dExpressionChanges: 0,
    feedbackLoopsCompleted: 0,
    totalFeedbackScore: 0,
  };

  constructor(config: Partial<EcosystemConfig> = {}) {
    super();
    this.config = { ...DEFAULT_ECO_CONFIG, ...config };
  }

  // ─── Lifecycle ─────────────────────────────────────────────

  async start(components: {
    agentverse?: AgentverseBridge;
    vorticog?: VorticogTwin;
    live2d?: Live2DEmbodiment;
  }): Promise<void> {
    // Wire components
    if (this.config.agentverse.enabled && components.agentverse) {
      this.agentverse = components.agentverse;
      this.agentverse.on('message_received', (msg) => this.onAgentverseMessage(msg));
      await this.agentverse.start();
    }

    if (this.config.vorticog.enabled && components.vorticog) {
      this.vorticog = components.vorticog;
      this.vorticog.on('tick_complete', (result) => this.onVorticogTick(result));
      await this.vorticog.start();
    }

    if (this.config.live2d.enabled && components.live2d) {
      this.live2d = components.live2d;
      await this.live2d.start();
    }

    // Start integration loop
    this.loopTimer = setInterval(
      () => this.integrationCycle(),
      this.config.integrationLoopMs,
    );

    this.running = true;
    this.emit('started', this.getState());
  }

  async stop(): Promise<void> {
    if (this.loopTimer) clearInterval(this.loopTimer);
    if (this.agentverse) await this.agentverse.stop();
    if (this.vorticog) await this.vorticog.stop();
    if (this.live2d) await this.live2d.stop();
    this.running = false;
    this.emit('stopped');
  }

  // ─── Integration Cycle ────────────────────────────────────

  async integrationCycle(): Promise<IntegrationCycleResult> {
    this.cycleCount++;
    this.metrics.integrationCycles++;
    let agentverseMessages = 0;
    let vorticogDecisions = 0;
    let expressionChanged = false;

    // Phase 1: Process Agentverse messages
    if (this.agentverse) {
      const pending = this.agentverse.getPendingMessages();
      for (const msg of pending) {
        await this.processAgentverseMessage(msg);
        agentverseMessages++;
      }
      this.metrics.agentverseMessagesProcessed += agentverseMessages;
    }

    // Phase 2: Sync DTE state to Vorticog
    if (this.vorticog) {
      await this.vorticog.syncDTEState({
        aarState: this.cognitiveState.aarState,
        endocrineState: this.cognitiveState.endocrine,
        ontogeneticStage: this.cognitiveState.ontogeneticStage,
        coherence: this.cognitiveState.collectiveCoherence,
      });
    }

    // Phase 3: Update Live2D avatar
    if (this.live2d) {
      const prevExpression = this.live2d.getCurrentExpression();
      this.live2d.updateFromCognitiveState(this.cognitiveState);
      expressionChanged = this.live2d.getCurrentExpression() !== prevExpression;
      if (expressionChanged) this.metrics.live2dExpressionChanges++;
    }

    // Phase 4: Feedback loop
    let feedbackScore = 0;
    if (this.config.feedbackEnabled && this.vorticog) {
      const feedback = this.vorticog.getSimulationFeedback();
      feedbackScore = feedback.decisionQuality;

      // Modulate endocrine state from simulation feedback
      this.cognitiveState.endocrine.dopamine =
        this.cognitiveState.endocrine.dopamine * 0.8 + feedback.successRate * 0.2;
      this.cognitiveState.endocrine.cortisol =
        this.cognitiveState.endocrine.cortisol * 0.8 + (1 - feedback.agentWellbeing) * 0.2;
      this.cognitiveState.endocrine.valence =
        this.cognitiveState.endocrine.valence * 0.7 + (feedback.profitability * 0.5 + feedback.agentWellbeing - 0.5) * 0.3;

      this.metrics.feedbackLoopsCompleted++;
      this.metrics.totalFeedbackScore += feedbackScore;
    }

    // Advance Echobeats phase
    this.cognitiveState.echobeatsPhase = (this.cognitiveState.echobeatsPhase + 1) % 12;

    const result: IntegrationCycleResult = {
      cycle: this.cycleCount,
      agentverseMessages,
      vorticogDecisions,
      live2dExpressionChange: expressionChanged,
      feedbackScore,
      timestamp: Date.now(),
    };

    this.emit('cycle_complete', result);
    return result;
  }

  // ─── Event Handlers ───────────────────────────────────────

  private async onAgentverseMessage(msg: any): Promise<void> {
    // Forward external agent queries to Vorticog for market data
    if (msg.protocol?.includes('market') && this.vorticog) {
      const company = this.vorticog.getCompany();
      if (company && this.agentverse) {
        await this.agentverse.sendMessage(msg.sender, 'dte:market/1.0', {
          companyName: company.name,
          cash: company.cash,
          reputation: company.reputation,
        });
      }
    }
  }

  private onVorticogTick(result: any): void {
    // Update cognitive state from simulation outcomes
    if (result.pnl) {
      const profitSignal = result.pnl.profit > 0 ? 0.1 : -0.1;
      this.cognitiveState.endocrine.valence = Math.max(-1, Math.min(1,
        this.cognitiveState.endocrine.valence + profitSignal));
    }
  }

  private async processAgentverseMessage(msg: any): Promise<void> {
    // Convert to A2A format and broadcast to collective
    const a2aMsg = this.agentverse?.convertToA2A(msg);
    if (a2aMsg) {
      this.emit('external_message', a2aMsg);
    }
  }

  // ─── Cognitive State Update (from MultiAgentCoordinator) ──

  updateCognitiveState(state: Partial<typeof this.cognitiveState>): void {
    Object.assign(this.cognitiveState, state);
    this.emit('cognitive_state_updated', this.cognitiveState);
  }

  // ─── Accessors ─────────────────────────────────────────────

  getState(): EcosystemState {
    return {
      agentverseConnected: this.agentverse?.isRunning() ?? false,
      agentverseAgentCount: this.agentverse?.getDiscoveredAgents().length ?? 0,
      vorticogConnected: this.vorticog?.isRunning() ?? false,
      vorticogCompanyCash: this.vorticog?.getCompany()?.cash ?? 0,
      live2dActive: this.live2d?.isRunning() ?? false,
      live2dExpression: this.live2d?.getCurrentExpression() ?? 'neutral_awareness',
      integrationCycles: this.cycleCount,
      lastCycleAt: Date.now(),
    };
  }

  getMetrics() { return { ...this.metrics }; }
  isRunning(): boolean { return this.running; }
}

// ============================================================
// Factory — Full Level 6 Stack
// ============================================================

export interface Level6Config {
  // Level 5+ (inherited)
  neonConnectionString: string;
  agentName: string;
  a2aPort: number;
  peerEndpoints: string[];
  // Level 6 (ecosystem)
  agentverseToken: string;
  vorticogUrl: string;
  vorticogCompanyId: number;
  live2dModelPath: string;
  live2dWsPort: number;
}

/**
 * Creates the complete Level 6 stack:
 *   Level 5+ (Memory + A2A + Coordinator)
 *     + Agentverse Bridge
 *     + Vorticog Digital Twin
 *     + Live2D Embodiment
 *     + Ecosystem Orchestrator
 */
export async function createLevel6Stack(config: Level6Config): Promise<{
  orchestrator: EcosystemOrchestrator;
}> {
  const { createAgentverseBridge } = await import('./agentverse-bridge');
  const { createVorticogTwin } = await import('./vorticog-twin');
  const { createLive2DEmbodiment } = await import('./live2d-embodiment');

  const agentverse = createAgentverseBridge({
    apiToken: config.agentverseToken,
    agentName: config.agentName,
  });

  const vorticog = createVorticogTwin({
    apiBaseUrl: config.vorticogUrl,
    companyId: config.vorticogCompanyId,
  });

  const live2d = createLive2DEmbodiment({
    modelPath: config.live2dModelPath,
    wsPort: config.live2dWsPort,
    resolution: [3840, 2160], // Always 4K
  });

  const orchestrator = new EcosystemOrchestrator();
  await orchestrator.start({ agentverse, vorticog, live2d });

  return { orchestrator };
}
