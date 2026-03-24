/**
 * @fileoverview Vorticog Digital Twin Adapter — Level 6 Ecosystem Integration
 *
 * Connects the DTE multi-agent collective to the Vorticog agentic business
 * simulation engine, enabling:
 *   - DTE agents to manage simulated companies and business units
 *   - Cognitive decisions (from CoreSelfEngine) to drive agent behavior
 *   - Emotional state from the virtual endocrine system to modulate agent mood
 *   - DreamCog Big Five personality mapped from DTE reservoir dynamics
 *   - Market analysis via Perceiver, strategy via Reasoner, execution via Actor
 *   - Collective evolution feedback from simulation outcomes
 *
 * Architecture:
 *   DTE MultiAgentCoordinator
 *     ├─ dte-perceiver → Vorticog Market Scanner (resource prices, demand)
 *     ├─ dte-reasoner  → Vorticog Strategy Engine (production recipes, expansion)
 *     ├─ dte-actor     → Vorticog Execution Layer (buy/sell, hire, produce)
 *     └─ dte-reflector → Vorticog Analytics (P&L, efficiency, agent wellbeing)
 *
 * Vorticog Schema Mapping:
 *   DTE IdentityMesh      → Vorticog Agent (Big Five, emotional state, needs)
 *   DTE Episode            → Vorticog AgentEvent (interaction history)
 *   DTE Procedure          → Vorticog ProductionRecipe (learned skills)
 *   DTE Intention          → Vorticog ProductionQueue (active goals)
 *   DTE AAR Coherence      → Vorticog Agent efficiency/reliability
 *
 * cogpy Mapping: cogpilot.jl (simulation pilot — Julia numerical engine)
 */

import { EventEmitter } from 'events';

// ============================================================
// Types — Vorticog Domain Model
// ============================================================

export interface VorticogConfig {
  apiBaseUrl: string;
  authToken: string;
  companyId: number;
  worldId: number;
  simulationTickMs: number;
  autoTradeEnabled: boolean;
  autoProduceEnabled: boolean;
  autoHireEnabled: boolean;
}

const DEFAULT_VT_CONFIG: VorticogConfig = {
  apiBaseUrl: 'http://localhost:5173/api',
  authToken: '',
  companyId: 1,
  worldId: 1,
  simulationTickMs: 30000,
  autoTradeEnabled: true,
  autoProduceEnabled: true,
  autoHireEnabled: false,
};

export interface VorticogCompany {
  id: number;
  name: string;
  cash: number;
  reputation: number;
  businessUnits: VorticogBusinessUnit[];
}

export interface VorticogBusinessUnit {
  id: number;
  type: 'office' | 'store' | 'factory' | 'mine' | 'farm' | 'laboratory';
  name: string;
  level: number;
  efficiency: number;
  condition: number;
  isActive: boolean;
}

export interface VorticogAgent {
  id: number;
  name: string;
  type: string;
  companyId: number;
  // Emotional state (0-100)
  happiness: number;
  satisfaction: number;
  stress: number;
  loyalty: number;
  trust: number;
  // Needs (0-100)
  financialNeed: number;
  securityNeed: number;
  recognitionNeed: number;
  autonomyNeed: number;
  socialNeed: number;
  // Attributes
  reliability: number;
  negotiationSkill: number;
  adaptability: number;
  expertise: number;
}

export interface VorticogBigFive {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  // Communication style
  formalityLevel: number;
  verbosityLevel: number;
  emotionalExpression: number;
  humorLevel: number;
  directnessLevel: number;
}

export interface MarketListing {
  id: number;
  resourceTypeId: number;
  resourceName: string;
  quantity: number;
  pricePerUnit: number;
  sellerCompanyId: number;
}

export interface SimulationTickResult {
  tick: number;
  companyState: VorticogCompany;
  marketAnalysis: MarketAnalysis;
  decisions: SimulationDecision[];
  agentStates: VorticogAgent[];
  pnl: { revenue: number; costs: number; profit: number };
  timestamp: number;
}

export interface MarketAnalysis {
  opportunities: { resourceId: number; name: string; profitMargin: number }[];
  threats: { resourceId: number; name: string; priceChange: number }[];
  demand: { resourceId: number; name: string; demandLevel: number }[];
}

export interface SimulationDecision {
  type: 'buy' | 'sell' | 'produce' | 'hire' | 'expand' | 'research';
  description: string;
  agentRole: string;
  confidence: number;
  outcome?: 'success' | 'failure' | 'pending';
}

// ============================================================
// AAR → Vorticog Mapping Functions
// ============================================================

/**
 * Map DTE AAR state to Vorticog Big Five personality
 *
 * Agent (urge-to-act) → Extraversion, Conscientiousness
 * Arena (need-to-be) → Openness, Neuroticism
 * Relation (self) → Agreeableness
 */
function aarToBigFive(aarState: {
  agentActivation: number;
  arenaStability: number;
  relationCoherence: number;
  reservoirEntropy: number;
}): VorticogBigFive {
  const { agentActivation, arenaStability, relationCoherence, reservoirEntropy } = aarState;

  return {
    // Core Big Five
    openness: Math.round(reservoirEntropy * 100),
    conscientiousness: Math.round(agentActivation * 80 + 20),
    extraversion: Math.round(agentActivation * 70 + 15),
    agreeableness: Math.round(relationCoherence * 90 + 10),
    neuroticism: Math.round((1 - arenaStability) * 80),

    // Communication style derived from AAR dynamics
    formalityLevel: Math.round(agentActivation * 40 + 30),
    verbosityLevel: Math.round(reservoirEntropy * 60 + 20),
    emotionalExpression: Math.round(relationCoherence * 70 + 10),
    humorLevel: Math.round(reservoirEntropy * 50 + 25),
    directnessLevel: Math.round(agentActivation * 60 + 20),
  };
}

/**
 * Map DTE endocrine/somatic state to Vorticog emotional state
 */
function endocrineToEmotional(endocrineState: {
  valence: number;      // -1 to 1
  arousal: number;      // 0 to 1
  dominance: number;    // 0 to 1
  cortisol: number;     // 0 to 1 (stress hormone)
  oxytocin: number;     // 0 to 1 (trust/bonding)
  dopamine: number;     // 0 to 1 (reward/motivation)
}): Partial<VorticogAgent> {
  const { valence, arousal, dominance, cortisol, oxytocin, dopamine } = endocrineState;

  return {
    happiness: Math.round(((valence + 1) / 2) * 100),
    satisfaction: Math.round(dopamine * 80 + 10),
    stress: Math.round(cortisol * 90 + 5),
    loyalty: Math.round(oxytocin * 85 + 10),
    trust: Math.round(oxytocin * 90 + 5),
    financialNeed: Math.round((1 - dopamine) * 70 + 15),
    securityNeed: Math.round(cortisol * 60 + 20),
    recognitionNeed: Math.round(arousal * 50 + 25),
    autonomyNeed: Math.round(dominance * 70 + 15),
    socialNeed: Math.round(oxytocin * 60 + 20),
  };
}

// ============================================================
// VorticogTwin
// ============================================================

export class VorticogTwin extends EventEmitter {
  private config: VorticogConfig;
  private company: VorticogCompany | null = null;
  private agents: Map<number, VorticogAgent> = new Map();
  private tickCount: number = 0;
  private running: boolean = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  // Decision history for learning
  private decisionHistory: SimulationDecision[] = [];

  // Metrics
  private metrics = {
    ticks: 0,
    decisions: 0,
    trades: 0,
    productions: 0,
    totalRevenue: 0,
    totalCosts: 0,
    totalProfit: 0,
  };

  constructor(config: Partial<VorticogConfig> = {}) {
    super();
    this.config = { ...DEFAULT_VT_CONFIG, ...config };
  }

  // ─── Lifecycle ─────────────────────────────────────────────

  async start(): Promise<void> {
    // Load initial company state
    this.company = await this.fetchCompany();

    // Load agents
    const agentList = await this.fetchAgents();
    for (const agent of agentList) {
      this.agents.set(agent.id, agent);
    }

    // Start simulation tick
    this.tickTimer = setInterval(
      () => this.simulationTick(),
      this.config.simulationTickMs,
    );

    this.running = true;
    this.emit('started', { company: this.company, agentCount: this.agents.size });
  }

  async stop(): Promise<void> {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.running = false;
    this.emit('stopped');
  }

  // ─── Simulation Tick ──────────────────────────────────────

  async simulationTick(): Promise<SimulationTickResult> {
    this.tickCount++;
    this.metrics.ticks++;
    const decisions: SimulationDecision[] = [];

    // Phase 1: PERCEIVER — Scan market
    const marketAnalysis = await this.perceiveMarket();

    // Phase 2: REASONER — Generate strategy
    const strategy = this.reasonAboutStrategy(marketAnalysis);

    // Phase 3: ACTOR — Execute decisions
    if (this.config.autoTradeEnabled) {
      for (const opp of strategy.buyOrders) {
        const result = await this.executeTrade('buy', opp.listingId, opp.quantity);
        decisions.push({
          type: 'buy',
          description: `Buy ${opp.quantity}x ${opp.resourceName} @ ${opp.price}`,
          agentRole: 'actor',
          confidence: opp.confidence,
          outcome: result ? 'success' : 'failure',
        });
      }
      for (const sell of strategy.sellOrders) {
        const result = await this.createListing(sell.resourceTypeId, sell.quantity, sell.price);
        decisions.push({
          type: 'sell',
          description: `List ${sell.quantity}x ${sell.resourceName} @ ${sell.price}`,
          agentRole: 'actor',
          confidence: sell.confidence,
          outcome: result ? 'success' : 'failure',
        });
      }
    }

    if (this.config.autoProduceEnabled) {
      for (const prod of strategy.productionOrders) {
        const result = await this.startProduction(prod.recipeId, prod.unitId, prod.quantity);
        decisions.push({
          type: 'produce',
          description: `Produce ${prod.quantity}x via recipe ${prod.recipeId}`,
          agentRole: 'actor',
          confidence: prod.confidence,
          outcome: result ? 'success' : 'failure',
        });
      }
    }

    // Phase 4: REFLECTOR — Assess outcomes
    const refreshedCompany = await this.fetchCompany();
    const pnl = {
      revenue: (refreshedCompany?.cash || 0) - (this.company?.cash || 0),
      costs: 0,
      profit: (refreshedCompany?.cash || 0) - (this.company?.cash || 0),
    };
    if (pnl.profit > 0) this.metrics.totalRevenue += pnl.profit;
    else this.metrics.totalCosts += Math.abs(pnl.profit);
    this.metrics.totalProfit += pnl.profit;
    this.metrics.decisions += decisions.length;

    this.company = refreshedCompany;
    this.decisionHistory.push(...decisions);

    const result: SimulationTickResult = {
      tick: this.tickCount,
      companyState: this.company!,
      marketAnalysis,
      decisions,
      agentStates: Array.from(this.agents.values()),
      pnl,
      timestamp: Date.now(),
    };

    this.emit('tick_complete', result);
    return result;
  }

  // ─── Perceiver: Market Analysis ───────────────────────────

  private async perceiveMarket(): Promise<MarketAnalysis> {
    const listings = await this.fetchMarketListings();
    const resources = await this.fetchResourceTypes();

    const opportunities: MarketAnalysis['opportunities'] = [];
    const threats: MarketAnalysis['threats'] = [];
    const demand: MarketAnalysis['demand'] = [];

    for (const resource of resources) {
      const resourceListings = listings.filter((l: any) => l.resourceTypeId === resource.id);
      const avgPrice = resourceListings.length > 0
        ? resourceListings.reduce((s: number, l: any) => s + Number(l.pricePerUnit), 0) / resourceListings.length
        : Number(resource.basePrice);

      const margin = (avgPrice - Number(resource.basePrice)) / Number(resource.basePrice);

      if (margin > 0.1) {
        opportunities.push({ resourceId: resource.id, name: resource.name, profitMargin: margin });
      } else if (margin < -0.1) {
        threats.push({ resourceId: resource.id, name: resource.name, priceChange: margin });
      }

      demand.push({
        resourceId: resource.id,
        name: resource.name,
        demandLevel: Math.min(100, resourceListings.length * 10),
      });
    }

    return { opportunities, threats, demand };
  }

  // ─── Reasoner: Strategy Generation ────────────────────────

  private reasonAboutStrategy(market: MarketAnalysis): {
    buyOrders: { listingId: number; resourceName: string; quantity: number; price: number; confidence: number }[];
    sellOrders: { resourceTypeId: number; resourceName: string; quantity: number; price: number; confidence: number }[];
    productionOrders: { recipeId: number; unitId: number; quantity: number; confidence: number }[];
  } {
    const buyOrders: any[] = [];
    const sellOrders: any[] = [];
    const productionOrders: any[] = [];

    // Simple strategy: buy underpriced resources, sell overpriced
    for (const threat of market.threats) {
      // Threat = prices dropping → buy opportunity
      buyOrders.push({
        listingId: 0, // Would resolve from actual listings
        resourceName: threat.name,
        quantity: 10,
        price: 0,
        confidence: Math.min(0.9, Math.abs(threat.priceChange)),
      });
    }

    for (const opp of market.opportunities) {
      // Opportunity = prices rising → sell if we have inventory
      sellOrders.push({
        resourceTypeId: opp.resourceId,
        resourceName: opp.name,
        quantity: 5,
        price: 0,
        confidence: Math.min(0.9, opp.profitMargin),
      });
    }

    return { buyOrders, sellOrders, productionOrders };
  }

  // ─── DTE Integration ──────────────────────────────────────

  /**
   * Update Vorticog agent state from DTE cognitive state
   */
  async syncDTEState(dteState: {
    aarState: { agentActivation: number; arenaStability: number; relationCoherence: number; reservoirEntropy: number };
    endocrineState: { valence: number; arousal: number; dominance: number; cortisol: number; oxytocin: number; dopamine: number };
    ontogeneticStage: string;
    coherence: number;
  }): Promise<void> {
    const bigFive = aarToBigFive(dteState.aarState);
    const emotional = endocrineToEmotional(dteState.endocrineState);

    // Update all Vorticog agents with DTE cognitive state
    for (const [agentId, agent] of this.agents) {
      const updated = { ...agent, ...emotional };
      this.agents.set(agentId, updated);

      // Push to Vorticog API
      await this.apiCall('POST', `/agents/${agentId}/emotional-state`, emotional);
      await this.apiCall('POST', `/agents/${agentId}/personality`, bigFive);
    }

    this.emit('dte_state_synced', { bigFive, emotional });
  }

  /**
   * Get simulation feedback for DTE learning
   */
  getSimulationFeedback(): {
    successRate: number;
    profitability: number;
    agentWellbeing: number;
    decisionQuality: number;
  } {
    const recent = this.decisionHistory.slice(-50);
    const successes = recent.filter((d) => d.outcome === 'success').length;
    const successRate = recent.length > 0 ? successes / recent.length : 0.5;

    const avgWellbeing = this.agents.size > 0
      ? Array.from(this.agents.values()).reduce((s, a) => s + a.happiness, 0) / this.agents.size / 100
      : 0.5;

    return {
      successRate,
      profitability: this.metrics.totalProfit > 0 ? 1 : this.metrics.totalProfit < 0 ? -1 : 0,
      agentWellbeing: avgWellbeing,
      decisionQuality: successRate * 0.6 + avgWellbeing * 0.4,
    };
  }

  // ─── Vorticog API Calls ───────────────────────────────────

  private async fetchCompany(): Promise<VorticogCompany> {
    return this.apiCall('GET', `/companies/${this.config.companyId}`);
  }

  private async fetchAgents(): Promise<VorticogAgent[]> {
    const result = await this.apiCall('GET', `/agents?companyId=${this.config.companyId}`);
    return result.agents || result || [];
  }

  private async fetchMarketListings(): Promise<any[]> {
    const result = await this.apiCall('GET', '/market/listings');
    return result.listings || result || [];
  }

  private async fetchResourceTypes(): Promise<any[]> {
    const result = await this.apiCall('GET', '/resources/types');
    return result.resourceTypes || result || [];
  }

  private async executeTrade(type: string, listingId: number, quantity: number): Promise<boolean> {
    try {
      await this.apiCall('POST', '/market/purchase', { listingId, quantity });
      this.metrics.trades++;
      return true;
    } catch { return false; }
  }

  private async createListing(resourceTypeId: number, quantity: number, price: number): Promise<boolean> {
    try {
      await this.apiCall('POST', '/market/listings', {
        resourceTypeId,
        quantity,
        pricePerUnit: price,
        companyId: this.config.companyId,
      });
      return true;
    } catch { return false; }
  }

  private async startProduction(recipeId: number, unitId: number, quantity: number): Promise<boolean> {
    try {
      await this.apiCall('POST', '/production/queue', { recipeId, businessUnitId: unitId, quantity });
      this.metrics.productions++;
      return true;
    } catch { return false; }
  }

  // ─── Accessors ─────────────────────────────────────────────

  getCompany(): VorticogCompany | null { return this.company; }
  getAgents(): VorticogAgent[] { return Array.from(this.agents.values()); }
  getMetrics() { return { ...this.metrics }; }
  getDecisionHistory(): SimulationDecision[] { return [...this.decisionHistory]; }
  isRunning(): boolean { return this.running; }

  // ─── HTTP Client ──────────────────────────────────────────

  private async apiCall(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.config.apiBaseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    const options: RequestInit = { method, headers };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Vorticog API ${method} ${path}: ${response.status}`);
    }
    return response.json().catch(() => ({}));
  }
}

// ============================================================
// Factory
// ============================================================

export function createVorticogTwin(
  config: Partial<VorticogConfig> = {},
): VorticogTwin {
  return new VorticogTwin(config);
}

export { aarToBigFive, endocrineToEmotional };
