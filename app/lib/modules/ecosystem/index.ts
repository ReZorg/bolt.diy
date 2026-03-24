/**
 * @fileoverview Ecosystem Module Index — Level 6 (Ecosystem Integration)
 *
 * Three ecosystem bridges + unified orchestrator:
 *
 *   Agentverse Bridge  — Fetch.ai Almanac, mailbox, discovery
 *   Vorticog Twin      — Business simulation, DreamCog personality
 *   Live2D Embodiment  — FACS expressions, Cubism parameters, 4K avatar
 *   Orchestrator       — Unified integration loop with feedback
 */

// Agentverse Bridge (Fetch.ai)
export {
  AgentverseBridge,
  createAgentverseBridge,
  DTE_PROTOCOLS,
  ROLE_TO_PROTOCOLS,
  type AgentverseConfig,
  type AgentverseAgent,
  type AlmanacEntry,
  type MailboxMessage,
  type DiscoveryResult,
} from './agentverse-bridge';

// Vorticog Digital Twin
export {
  VorticogTwin,
  createVorticogTwin,
  aarToBigFive,
  endocrineToEmotional,
  type VorticogConfig,
  type VorticogCompany,
  type VorticogBusinessUnit,
  type VorticogAgent,
  type VorticogBigFive,
  type MarketListing,
  type SimulationTickResult,
  type MarketAnalysis,
  type SimulationDecision,
} from './vorticog-twin';

// Live2D Embodiment
export {
  Live2DEmbodiment,
  createLive2DEmbodiment,
  EXPRESSION_PRESETS,
  FACS_LIBRARY,
  endocrineToExpression,
  type Live2DConfig,
  type CubismState,
  type ActionUnit,
  type ExpressionPreset,
} from './live2d-embodiment';

// Ecosystem Orchestrator
export {
  EcosystemOrchestrator,
  createLevel6Stack,
  type EcosystemConfig,
  type EcosystemState,
  type IntegrationCycleResult,
  type Level6Config,
} from './ecosystem-orchestrator';
