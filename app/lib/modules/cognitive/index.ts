/**
 * @fileoverview Cognitive Module Index — Level 6 (Closed-Loop Ecosystem) Stack
 *
 * Exports all components for the DTE Level 6 autonomy stack:
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │               Level 6: Closed-Loop Ecosystem Bridges               │
 *   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
 *   │  │  Autognosis   │  │   Somatic    │  │  CogMorph → Live2D      │ │
 *   │  │  → SelfMod    │  │  → Reservoir │  │  (4K FACS Expression)   │ │
 *   │  │  (Closed-Loop)│  │  (Embodied)  │  │                         │ │
 *   │  └──────┬───────┘  └──────┬───────┘  └────────────┬────────────┘ │
 *   │         │                 │                        │              │
 *   │  ┌──────┴─────────────────┴────────────────────────┴────────────┐ │
 *   │  │             Identity MLP → Hypergraph Memory                 │ │
 *   │  │        (49→128→64→30 Backup, Drift Detection, Recovery)     │ │
 *   │  └─────────────────────────────────────────────────────────────┘ │
 *   ├─────────────────────────────────────────────────────────────────────┤
 *   │            MultiAgentCoordinator (System 5 Tetradic)               │
 *   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
 *   │  │ A2A Protocol │  │  Hypergraph  │  │ AutonomyLifecycle    │    │
 *   │  │  (Mesh Net)  │  │ MemoryStore  │  │   Coordinator        │    │
 *   │  │              │  │ (Neon+pgvec) │  │ ┌──────┐ ┌────────┐ │    │
 *   │  │ heartbeat    │  │              │  │ │ Core │ │ Online │ │    │
 *   │  │ sync         │  │ AtomSpace    │  │ │ Self │ │ Reserv │ │    │
 *   │  │ query        │  │ Episodes     │  │ │Engine│ │Learner │ │    │
 *   │  │ consensus    │  │ Procedures   │  │ │      │ │ (RLS)  │ │    │
 *   │  │ broadcast    │  │ Intentions   │  │ │┌────┐│ └────────┘ │    │
 *   │  │ evolution    │  │ Snapshots    │  │ ││Lucy││ ┌────────┐ │    │
 *   │  └──────────────┘  │ SharedKnow   │  │ │└────┘│ │SelfMod │ │    │
 *   │                    └──────────────┘  │ │┌────┐│ │Engine  │ │    │
 *   │                                      │ ││ESN ││ └────────┘ │    │
 *   │                                      │ │└────┘│ ┌────────┐ │    │
 *   │                                      │ │┌────┐│ │Echobeat│ │    │
 *   │                                      │ ││Mesh││ │12-Step │ │    │
 *   │                                      │ │└────┘│ └────────┘ │    │
 *   │                                      │ └──────┘             │    │
 *   │                                      └──────────────────────┘    │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * Usage (Level 5 — single agent):
 *   import { createLevel5Stack } from './cognitive';
 *   const { coordinator } = createLevel5Stack({ lucy: { baseUrl: '...' } });
 *
 * Usage (Level 5+ — multi-agent):
 *   import { createLevel5PlusStack } from './cognitive';
 *   const { memoryStore, a2a, coordinator } = await createLevel5PlusStack({...});
 *
 * Usage (Level 6 — closed-loop bridges):
 *   import { createAutgnosisSelfModBridge, createSomaticReservoirBridge,
 *            createCogMorphLive2DBridge, createIdentityHypergraphBridge } from './cognitive';
 */

// ─── Level 5 Core Components ─────────────────────────────────

// Lucy GGUF Inference
export {
  LucyInferenceDriver,
  modulateSystemPrompt,
  generateLucyLaunchCommand,
  generateLucyDockerCompose,
  type LucyDriverConfig,
  type ChatMessage,
  type InferenceResult,
  type InferenceMetrics,
  type LucyServerInfo,
  type LucyDeploymentConfig,
} from './lucy-inference-driver';

// Core Self Engine (Lucy + Reservoir + Identity)
export {
  CoreSelfEngine,
  EchoReservoir,
  CognitiveReadout,
  AARRelation,
  IdentityMesh,
  OntogeneticStage,
  STAGE_THRESHOLDS,
  type ESNConfig,
  type AARState,
  type CoreSelfConfig,
  type CoreSelfResponse,
  type IdentityMeshState,
} from './core-self-engine';

// Online Reservoir Learner (RLS)
export {
  OnlineReservoirLearner,
  type OnlineLearnerConfig,
  type FeedbackSignal,
  type LearningUpdate,
  type LearnerState,
  type LearnerMetrics,
} from './online-reservoir-learner';

// Self-Modification Engine
export {
  SelfModificationEngine,
  type SelfModificationConfig,
  type ModifiableParameter,
  type ModificationRequest,
  type ModificationResult,
} from './self-modification-engine';

// Autonomy Lifecycle Coordinator + Echobeats
export {
  AutonomyLifecycleCoordinator,
  Echobeats,
  AutonomyPhase,
  createLevel5Stack,
  type AutonomyLifecycleConfig,
  type EchobeatsConfig,
  type CognitiveStream,
  type EchobeatsTick,
  type StreamPhase,
  type VirtualAgentModel,
  type VirtualArenaModel,
  type DevelopmentalCycleResult,
  type Level5Config,
} from './autonomy-lifecycle';

// Cognitive Daemon (Production Entry Point)
export {
  CognitiveDaemon,
  getCognitiveDaemon,
  maybeStartDaemon,
  type DaemonConfig,
} from './daemon';

// System5 Telemetry Shell (Prometheus Metrics)
export {
  System5TelemetryShell,
  type TelemetryConfig,
} from './telemetry-shell';

// ─── Level 5+ Multi-Agent Components ─────────────────────────

// Hypergraph Memory Store (Neon + pgvector)
export {
  HypergraphMemoryStore,
  type AtomKind,
  type AtomType,
  type MemorySubsystem,
  type TruthValue,
  type AttentionValue,
  type HypergraphAtom,
  type Episode,
  type AgentState,
  type SemanticSearchResult,
  type MemoryStoreConfig,
} from './hypergraph-memory-store';

// A2A (Agent-to-Agent) Protocol
export {
  A2AProtocol,
  createA2AProtocol,
  type A2AMessage,
  type A2AMessageType,
  type PeerAgent,
  type ConsensusProposal,
  type A2AProtocolConfig,
} from './a2a-protocol';

// Multi-Agent Coordinator
export {
  MultiAgentCoordinator,
  createMultiAgentCoordinator,
  createLevel5PlusStack,
  type AgentRole,
  type CollectiveState,
  type ConsensusRecord,
  type DyadicChannel,
  type TriadicCycle,
  type CollectiveEvolutionResult,
  type MultiAgentConfig,
  type Level5PlusConfig,
} from './multi-agent-coordinator';

// ─── Level 6 Closed-Loop Bridges ─────────────────────────────

// Autognosis → SelfModificationEngine (Closed-Loop Self-Improvement)
export {
  AutgnosisSelfModBridge,
  AutgnosisEngine,
  AutgnosisLevel,
  createAutgnosisSelfModBridge,
  type AutgnosisInsight,
  type EvolutionDirective,
  type BridgeConfig,
  type ForwardResult,
  type AuditEntry,
} from './autognosis-selfmod-bridge';

// Somatic Markers → ESN Reservoir (Embodied Emotional Feedback)
export {
  SomaticReservoirBridge,
  MarkerContext,
  createSomaticReservoirBridge,
  type SomaticMarker,
  type InjectionChannel,
  type SomaticReservoirConfig,
  type InjectionResult,
} from './somatic-reservoir-bridge';

// CogMorph → Live2D Cubism (Visual Self-Representation at 4K)
export {
  CogMorphLive2DBridge,
  CogMorphProjection,
  createCogMorphLive2DBridge,
  type CogMorphState,
  type EndocrineSnapshot,
  type VADState,
  type ActionUnit,
  type CubismParam,
  type ExpressionPreset,
  type CogMorphLive2DConfig,
} from './cogmorph-live2d-bridge';

// Identity MLP → Hypergraph Memory (Persistent Backup/Recovery)
export {
  IdentityHypergraphBridge,
  IdentityMLPEncoder,
  DegradationLevel,
  createIdentityHypergraphBridge,
  type IdentityVector,
  type IdentityBackup,
  type DriftAnalysis,
  type IdentityHypergraphConfig,
} from './identity-hypergraph-bridge';
