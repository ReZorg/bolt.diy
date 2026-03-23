/**
 * @fileoverview Cognitive Module Index — Level 5 (True Autonomy) Stack
 *
 * Exports all components needed for the DTE Level 5 autonomy stack:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │              AutonomyLifecycleCoordinator                   │
 *   │  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
 *   │  │ CoreSelf  │ │  Online  │ │  Self-   │ │  Echobeats  │  │
 *   │  │  Engine   │ │ Reservoir│ │  Mod     │ │  12-Step    │  │
 *   │  │          │ │ Learner  │ │ Engine   │ │  Cycle      │  │
 *   │  │ ┌──────┐ │ │  (RLS)   │ │ (Safety) │ │ (3 streams) │  │
 *   │  │ │ Lucy │ │ └──────────┘ └──────────┘ └─────────────┘  │
 *   │  │ │ GGUF │ │                                              │
 *   │  │ └──────┘ │                                              │
 *   │  │ ┌──────┐ │                                              │
 *   │  │ │ ESN  │ │                                              │
 *   │  │ │Reserv│ │                                              │
 *   │  │ └──────┘ │                                              │
 *   │  │ ┌──────┐ │                                              │
 *   │  │ │Ident │ │                                              │
 *   │  │ │ Mesh │ │                                              │
 *   │  │ └──────┘ │                                              │
 *   │  └───────────┘                                              │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   import { createLevel5Stack } from './cognitive';
 *   const { coordinator } = createLevel5Stack({ lucy: { baseUrl: '...' } });
 *   await coordinator.start();
 */

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
