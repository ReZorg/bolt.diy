/**
 * @fileoverview System5TelemetryShell — Prometheus Metrics Exporter
 *
 * The global telemetry shell wrapping all cognitive operations.
 * All local cores, channel computations, and pipes operate within
 * this shell with persistent gestalt perception.
 *
 * Exports Prometheus-compatible metrics on a configurable HTTP port:
 *   GET /metrics  → Prometheus scrape endpoint
 *   GET /health   → Health check endpoint
 *   GET /status   → JSON status endpoint (human-readable)
 *
 * Metric Categories:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  Shell 2 (Global)  — System-wide aggregates                │
 *   │  ┌─────────────────────────────────────────────────────────┐│
 *   │  │  Shell 1 (Org)  — Component-level metrics              ││
 *   │  │  ┌─────────────────────────────────────────────────────┐││
 *   │  │  │  Shell 0 (Process) — Per-tick, per-step metrics    │││
 *   │  │  └─────────────────────────────────────────────────────┘││
 *   │  └─────────────────────────────────────────────────────────┘│
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Thread Multiplexing Metrics:
 *   Tracks the 6 dyadic permutations P(i,j) and 2 complementary
 *   triads (MP1, MP2) for System 5 tetradic monitoring.
 *
 * Energy Flow Metrics:
 *   Tracks the 1/7 = 0.142857... S-gram period [1,4,2,8,5,7]
 *   modulating energy distribution across streams.
 *
 * cogpy Mapping: cogwebvm (web-based cognitive VM telemetry)
 */

import * as http from 'http';
import { EventEmitter } from 'events';
import type { CognitiveDaemon } from './daemon';

// ============================================================
// Metric Types
// ============================================================

interface GaugeMetric {
  name: string;
  help: string;
  type: 'gauge';
  value: number;
  labels?: Record<string, string>;
}

interface CounterMetric {
  name: string;
  help: string;
  type: 'counter';
  value: number;
  labels?: Record<string, string>;
}

interface HistogramBucket {
  le: number;
  count: number;
}

interface HistogramMetric {
  name: string;
  help: string;
  type: 'histogram';
  sum: number;
  count: number;
  buckets: HistogramBucket[];
  labels?: Record<string, string>;
}

type Metric = GaugeMetric | CounterMetric | HistogramMetric;

// ============================================================
// System 5 Telemetry Shell
// ============================================================

export interface TelemetryConfig {
  port: number;
  intervalMs: number;
  prefix: string;
  enableThreadMultiplexing: boolean;
  enableEnergyFlow: boolean;
}

const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  port: 9464,
  intervalMs: 5000,
  prefix: 'dte',
  enableThreadMultiplexing: true,
  enableEnergyFlow: true,
};

export class System5TelemetryShell extends EventEmitter {
  private config: TelemetryConfig;
  private daemon: CognitiveDaemon;
  private server: http.Server | null = null;
  private metrics: Map<string, Metric> = new Map();
  private collectTimer: ReturnType<typeof setInterval> | null = null;
  private running: boolean = false;

  // Histogram state
  private coherenceHistogram: number[] = [];
  private latencyHistogram: number[] = [];

  // Thread multiplexing state
  private readonly PERMUTATIONS: [number, number][] = [
    [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4],
  ];
  private readonly ENERGY_FLOW = [1, 4, 2, 8, 5, 7];

  constructor(daemon: CognitiveDaemon, config: Partial<TelemetryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_TELEMETRY_CONFIG, ...config };
    this.daemon = daemon;
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    const p = this.config.prefix;

    // ── Shell 2 (Global) ──────────────────────────────────────
    this.setGauge(`${p}_autonomy_level`, 'Current autonomy level (1-5)', 5);
    this.setGauge(`${p}_uptime_seconds`, 'Daemon uptime in seconds', 0);
    this.setGauge(`${p}_running`, 'Whether the daemon is running (1=yes, 0=no)', 0);

    // ── Shell 1 (Org) — Component Metrics ─────────────────────

    // Echobeats
    this.setGauge(`${p}_echobeats_global_step`, 'Echobeats global step counter', 0);
    this.setGauge(`${p}_echobeats_cycle_number`, 'Echobeats completed cycle count', 0);
    this.setGauge(`${p}_echobeats_coherence`, 'Average Echobeats stream coherence', 0);
    this.setGauge(`${p}_echobeats_energy`, 'Average Echobeats stream energy', 0);

    // Per-stream metrics
    for (let i = 0; i < 3; i++) {
      this.setGauge(`${p}_echobeats_stream_coherence`, `Stream ${i} coherence`, 0, { stream: String(i) });
      this.setGauge(`${p}_echobeats_stream_energy`, `Stream ${i} energy`, 0, { stream: String(i) });
      this.setGauge(`${p}_echobeats_stream_phase`, `Stream ${i} phase (0=perceive,1=reflect,2=plan,3=act)`, 0, { stream: String(i) });
    }

    // Lucy Inference
    this.setGauge(`${p}_lucy_healthy`, 'Lucy server health (1=healthy, 0=unhealthy)', 0);
    this.setCounter(`${p}_lucy_requests_total`, 'Total Lucy inference requests', 0);
    this.setCounter(`${p}_lucy_errors_total`, 'Total Lucy inference errors', 0);
    this.setGauge(`${p}_lucy_tokens_per_second`, 'Lucy tokens generated per second', 0);

    // Reservoir
    this.setGauge(`${p}_reservoir_energy`, 'Reservoir state vector energy (L2 norm)', 0);
    this.setGauge(`${p}_reservoir_slow_energy`, 'Reservoir slow state energy', 0);
    this.setGauge(`${p}_reservoir_tick`, 'Reservoir step counter', 0);

    // AAR (Agent-Arena-Relation)
    this.setGauge(`${p}_aar_coherence`, 'AAR average coherence', 0);
    this.setGauge(`${p}_aar_agent_coherence`, 'Agent (readout) coherence', 0);
    this.setGauge(`${p}_aar_arena_coherence`, 'Arena (reservoir) coherence', 0);
    this.setGauge(`${p}_aar_relation_coherence`, 'Relation (coupling) coherence', 0);

    // Identity Mesh
    this.setGauge(`${p}_identity_stage`, 'Ontogenetic stage (0=embryonic..5=elder)', 0);
    this.setGauge(`${p}_identity_interaction_count`, 'Total interaction count', 0);

    // RLS Online Learning
    this.setGauge(`${p}_rls_prediction_error`, 'Average RLS prediction error', 0);
    this.setGauge(`${p}_rls_learning_rate`, 'Effective RLS learning rate', 0);
    this.setCounter(`${p}_rls_updates_total`, 'Total RLS weight updates', 0);
    this.setGauge(`${p}_rls_weight_norm`, 'RLS weight vector L2 norm', 0);

    // Self-Modification
    this.setCounter(`${p}_selfmod_applied_total`, 'Total applied modifications', 0);
    this.setCounter(`${p}_selfmod_rejected_total`, 'Total rejected modifications', 0);
    this.setGauge(`${p}_selfmod_rate_per_minute`, 'Recent modifications per minute', 0);
    this.setGauge(`${p}_selfmod_dead_man_active`, 'Dead man switch active (1=yes)', 0);

    // Lifecycle
    this.setCounter(`${p}_lifecycle_cycles_total`, 'Total developmental cycles', 0);
    this.setGauge(`${p}_lifecycle_phase`, 'Current phase (0-4)', 0);
    this.setGauge(`${p}_lifecycle_coherence`, 'Overall lifecycle coherence', 0);

    // ── Shell 0 (Process) — Thread Multiplexing ───────────────
    if (this.config.enableThreadMultiplexing) {
      for (const [i, j] of this.PERMUTATIONS) {
        this.setGauge(`${p}_thread_perm_active`, `Thread permutation P(${i},${j}) active`, 0, { perm: `${i}_${j}` });
      }
      this.setGauge(`${p}_thread_triad`, 'Current triad (0=MP1, 1=MP2)', 0);
      this.setGauge(`${p}_thread_triad_step`, 'Current triad step (0-3)', 0);
    }

    // Energy Flow
    if (this.config.enableEnergyFlow) {
      this.setGauge(`${p}_energy_flow_position`, 'S-gram energy flow position (0-5)', 0);
      this.setGauge(`${p}_energy_flow_value`, 'Current S-gram energy value', 0);
    }
  }

  // ─── Metric Helpers ────────────────────────────────────────

  private setGauge(name: string, help: string, value: number, labels?: Record<string, string>): void {
    const key = labels ? `${name}{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}` : name;
    this.metrics.set(key, { name, help, type: 'gauge', value, labels });
  }

  private setCounter(name: string, help: string, value: number, labels?: Record<string, string>): void {
    const key = labels ? `${name}{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}` : name;
    this.metrics.set(key, { name, help, type: 'counter', value, labels });
  }

  private updateMetric(name: string, value: number, labels?: Record<string, string>): void {
    const key = labels ? `${name}{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}` : name;
    const metric = this.metrics.get(key);
    if (metric) metric.value = value;
  }

  // ─── Collection ────────────────────────────────────────────

  private collect(): void {
    const status = this.daemon.getStatus();
    const p = this.config.prefix;

    if (!status.running) {
      this.updateMetric(`${p}_running`, 0);
      return;
    }

    this.updateMetric(`${p}_running`, 1);
    this.updateMetric(`${p}_uptime_seconds`, ((status as any).uptime || 0) / 1000);

    // Echobeats
    const echobeats = this.daemon.getEchobeats();
    if (echobeats) {
      this.updateMetric(`${p}_echobeats_global_step`, echobeats.getGlobalStep());
      this.updateMetric(`${p}_echobeats_cycle_number`, echobeats.getCycleNumber());

      const streams = echobeats.getStreams();
      let totalCoherence = 0;
      let totalEnergy = 0;
      const phaseMap: Record<string, number> = { perceive: 0, reflect: 1, plan: 2, act: 3 };

      for (let i = 0; i < streams.length; i++) {
        this.updateMetric(`${p}_echobeats_stream_coherence`, streams[i].coherence, { stream: String(i) });
        this.updateMetric(`${p}_echobeats_stream_energy`, streams[i].energy, { stream: String(i) });
        this.updateMetric(`${p}_echobeats_stream_phase`, phaseMap[streams[i].phase] || 0, { stream: String(i) });
        totalCoherence += streams[i].coherence;
        totalEnergy += streams[i].energy;
      }
      this.updateMetric(`${p}_echobeats_coherence`, totalCoherence / Math.max(1, streams.length));
      this.updateMetric(`${p}_echobeats_energy`, totalEnergy / Math.max(1, streams.length));

      // Energy flow
      if (this.config.enableEnergyFlow) {
        const pos = echobeats.getGlobalStep() % 6;
        this.updateMetric(`${p}_energy_flow_position`, pos);
        this.updateMetric(`${p}_energy_flow_value`, this.ENERGY_FLOW[pos] / 8);
      }
    }

    // Lucy
    const coreSelf = this.daemon.getCoreSelf();
    if (coreSelf) {
      const lucy = coreSelf.getLucy();
      this.updateMetric(`${p}_lucy_healthy`, lucy.isHealthy() ? 1 : 0);
      const lucyMetrics = lucy.getMetrics();
      this.updateMetric(`${p}_lucy_requests_total`, lucyMetrics.totalRequests);
      this.updateMetric(`${p}_lucy_errors_total`, lucyMetrics.errors);
      if (lucyMetrics.totalDurationMs > 0 && lucyMetrics.totalTokensGenerated > 0) {
        this.updateMetric(`${p}_lucy_tokens_per_second`,
          (lucyMetrics.totalTokensGenerated / lucyMetrics.totalDurationMs) * 1000);
      }

      // Reservoir
      const reservoir = coreSelf.getReservoir();
      const state = reservoir.getState();
      let energy = 0;
      for (let i = 0; i < state.length; i++) energy += state[i] ** 2;
      this.updateMetric(`${p}_reservoir_energy`, Math.sqrt(energy / state.length));

      const slowState = reservoir.getSlowState();
      let slowEnergy = 0;
      for (let i = 0; i < slowState.length; i++) slowEnergy += slowState[i] ** 2;
      this.updateMetric(`${p}_reservoir_slow_energy`, Math.sqrt(slowEnergy / slowState.length));
      this.updateMetric(`${p}_reservoir_tick`, reservoir.getTick());

      // AAR
      const aar = coreSelf.getAAR();
      this.updateMetric(`${p}_aar_coherence`, aar.getAverageCoherence());

      // Identity
      const identity = coreSelf.getIdentity();
      const stageMap: Record<string, number> = {
        embryonic: 0, infant: 1, child: 2, adolescent: 3, adult: 4, elder: 5,
      };
      this.updateMetric(`${p}_identity_stage`, stageMap[identity.getStage()] || 0);
      this.updateMetric(`${p}_identity_interaction_count`, identity.getState().interactionCount);
    }

    // RLS
    const learner = this.daemon.getLearner();
    if (learner) {
      const metrics = learner.getMetrics();
      this.updateMetric(`${p}_rls_prediction_error`, metrics.avgPredictionError);
      this.updateMetric(`${p}_rls_learning_rate`, metrics.avgLearningRate);
      this.updateMetric(`${p}_rls_updates_total`, metrics.totalUpdates);
      this.updateMetric(`${p}_rls_weight_norm`, metrics.weightNorm);
    }

    // Self-Modification
    const selfMod = this.daemon.getSelfMod();
    if (selfMod) {
      const stats = selfMod.getStats();
      this.updateMetric(`${p}_selfmod_applied_total`, stats.totalModifications);
      this.updateMetric(`${p}_selfmod_rejected_total`, stats.totalRejections);
      this.updateMetric(`${p}_selfmod_rate_per_minute`, stats.recentModificationsPerMinute);
      this.updateMetric(`${p}_selfmod_dead_man_active`, stats.deadManSwitchActive ? 1 : 0);
    }

    // Lifecycle
    const coordinator = this.daemon.getCoordinator();
    if (coordinator) {
      const coordStatus = coordinator.getStatus();
      this.updateMetric(`${p}_lifecycle_cycles_total`, coordStatus.cycleCount);
      this.updateMetric(`${p}_lifecycle_coherence`, coordStatus.coherence);
      const phaseMap2: Record<string, number> = {
        perception: 0, modeling: 1, reflection: 2, mirroring: 3, enaction: 4,
      };
      this.updateMetric(`${p}_lifecycle_phase`, phaseMap2[coordStatus.currentPhase] || 0);
    }
  }

  // ─── Prometheus Format ─────────────────────────────────────

  private formatMetrics(): string {
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const [_key, metric] of this.metrics) {
      // Emit HELP and TYPE only once per metric name
      if (!seen.has(metric.name)) {
        lines.push(`# HELP ${metric.name} ${metric.help}`);
        lines.push(`# TYPE ${metric.name} ${metric.type}`);
        seen.add(metric.name);
      }

      if (metric.labels && Object.keys(metric.labels).length > 0) {
        const labelStr = Object.entries(metric.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        lines.push(`${metric.name}{${labelStr}} ${metric.value}`);
      } else {
        lines.push(`${metric.name} ${metric.value}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  // ─── HTTP Server ───────────────────────────────────────────

  async start(): Promise<void> {
    // Start collection timer
    this.collectTimer = setInterval(() => this.collect(), this.config.intervalMs);
    this.collect(); // Initial collection

    // Start HTTP server
    this.server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${this.config.port}`);

      if (url.pathname === '/metrics') {
        this.collect(); // Fresh collection on scrape
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
        res.end(this.formatMetrics());
      } else if (url.pathname === '/health') {
        const healthy = this.daemon.isRunning();
        res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: healthy ? 'healthy' : 'unhealthy' }));
      } else if (url.pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.daemon.getStatus(), null, 2));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.config.port, '0.0.0.0', () => {
        console.log(`[telemetry] System5TelemetryShell listening on :${this.config.port}`);
        console.log(`[telemetry]   /metrics  — Prometheus scrape endpoint`);
        console.log(`[telemetry]   /health   — Health check`);
        console.log(`[telemetry]   /status   — JSON status`);
        resolve();
      });
      this.server!.on('error', reject);
    });

    this.running = true;
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (this.collectTimer) {
      clearInterval(this.collectTimer);
      this.collectTimer = null;
    }
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }
    this.running = false;
    this.emit('stopped');
  }

  isRunning(): boolean { return this.running; }
}
