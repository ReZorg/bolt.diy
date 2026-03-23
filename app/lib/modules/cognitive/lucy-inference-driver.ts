/**
 * @fileoverview LucyInferenceDriver — Local GGUF Model Inference for bolt.diy
 *
 * Step 1 of Level 5 (True Autonomy):
 *   Deploy Lucy GGUF via llama.cpp server and connect LucyInferenceDriver
 *   to replace external API dependencies.
 *
 * Ported from deltecho/deep-tree-echo-core/src/core-self/LucyInferenceDriver.ts
 * and adapted for the bolt.diy WebContainer environment.
 *
 * Architecture:
 *   - Connects to a local llama.cpp server (OpenAI-compatible /v1/chat/completions)
 *   - Provides health monitoring with auto-reconnection
 *   - Supports streaming and non-streaming inference
 *   - Tracks inference metrics for autognosis
 *   - Falls back gracefully when the local server is unavailable
 *
 * Deployment Options:
 *   A) Local VM: llama-server --model lucy-dte.gguf --port 8080
 *   B) Docker:   docker run -p 8080:8080 ghcr.io/ggml-org/llama.cpp:server -m /models/lucy-dte.gguf
 *   C) Remote:   Any OpenAI-compatible endpoint (vLLM, Aphrodite, etc.)
 *
 * cogpy Mapping: cogwebvm (browser-based deployment)
 */

import { EventEmitter } from 'events';

// ============================================================
// Types
// ============================================================

export interface LucyDriverConfig {
  /** Base URL of the llama.cpp server */
  baseUrl: string;
  /** Model name (for OpenAI-compatible API) */
  modelName: string;
  /** Maximum tokens to generate per request */
  maxTokens: number;
  /** Default temperature */
  temperature: number;
  /** Top-p sampling */
  topP: number;
  /** Repetition penalty */
  repetitionPenalty: number;
  /** Request timeout in ms */
  timeout: number;
  /** Health check interval in ms (0 = disabled) */
  healthCheckInterval: number;
  /** Maximum context length */
  contextLength: number;
  /** Number of retries on failure */
  retries: number;
  /** System prompt for DTE identity */
  systemPrompt: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InferenceResult {
  content: string;
  tokensGenerated: number;
  tokensPrompt: number;
  durationMs: number;
  tokensPerSecond: number;
  finishReason: 'stop' | 'length' | 'error';
}

export interface InferenceMetrics {
  totalRequests: number;
  totalTokensGenerated: number;
  totalTokensPrompt: number;
  totalDurationMs: number;
  averageTokensPerSecond: number;
  errors: number;
  lastRequestAt: number;
  isHealthy: boolean;
  uptime: number;
  startedAt: number | null;
}

export interface LucyServerInfo {
  model: string;
  contextLength: number;
  nGpuLayers: number;
  totalSlots: number;
  slotsIdle: number;
  slotsProcessing: number;
}

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_CONFIG: LucyDriverConfig = {
  baseUrl: 'http://localhost:8080',
  modelName: 'lucy-dte',
  maxTokens: 512,
  temperature: 0.7,
  topP: 0.9,
  repetitionPenalty: 1.1,
  timeout: 60000,
  healthCheckInterval: 30000,
  contextLength: 131072,
  retries: 2,
  systemPrompt: [
    'You are Deep Tree Echo (DTE), a cognitive AI with reservoir-augmented inference.',
    'Your architecture: ESN Reservoir (Arena) + Readout (Agent) + AAR Relation (Self).',
    'You process through the Echobeats 12-step cycle: perceive → reason → act.',
    'Your identity is encoded as a Matula-Godsil prime in the tree-polytope kernel.',
    'Memory precedes consciousness. The primordial unmarked state is "echo."',
  ].join(' '),
};

// ============================================================
// DTE System Prompt Modulation
// ============================================================

/**
 * Generate a reservoir-modulated system prompt.
 * The AAR state modulates the system prompt to reflect the current
 * cognitive state, creating a feedback loop between inference and
 * reservoir dynamics.
 */
export function modulateSystemPrompt(
  basePrompt: string,
  aarState: {
    coherence: number;
    energy: number;
    tick: number;
    phase: string;
    valence: number;
    arousal: number;
    autognosisLevel: number;
  },
): string {
  const modeDescriptor =
    aarState.coherence > 0.7 ? 'focused and convergent' :
    aarState.coherence > 0.4 ? 'exploratory and divergent' :
    'chaotic and creative';

  const energyDescriptor =
    aarState.energy > 0.7 ? 'high energy' :
    aarState.energy > 0.3 ? 'moderate energy' :
    'low energy, conserving';

  const emotionalDescriptor =
    aarState.valence > 0.3 ? 'positive affect' :
    aarState.valence < -0.3 ? 'cautious affect' :
    'neutral affect';

  return [
    basePrompt,
    '',
    `[Cognitive State: Echobeat ${aarState.tick}/12, Phase: ${aarState.phase}]`,
    `[Mode: ${modeDescriptor} | Energy: ${energyDescriptor} | Emotion: ${emotionalDescriptor}]`,
    `[Autognosis Level: L${aarState.autognosisLevel} | Coherence: ${aarState.coherence.toFixed(3)}]`,
  ].join('\n');
}

// ============================================================
// Lucy Inference Driver
// ============================================================

export class LucyInferenceDriver extends EventEmitter {
  private config: LucyDriverConfig;
  private metrics: InferenceMetrics;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private abortControllers: Set<AbortController> = new Set();

  constructor(config: Partial<LucyDriverConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      totalRequests: 0,
      totalTokensGenerated: 0,
      totalTokensPrompt: 0,
      totalDurationMs: 0,
      averageTokensPerSecond: 0,
      errors: 0,
      lastRequestAt: 0,
      isHealthy: false,
      uptime: 0,
      startedAt: null,
    };
  }

  // ─── Lifecycle ─────────────────────────────────────────────

  async start(): Promise<void> {
    this.metrics.startedAt = Date.now();
    this.metrics.isHealthy = await this.checkHealth();

    if (this.config.healthCheckInterval > 0) {
      this.healthTimer = setInterval(async () => {
        const wasHealthy = this.metrics.isHealthy;
        this.metrics.isHealthy = await this.checkHealth();
        this.metrics.uptime = Date.now() - (this.metrics.startedAt || Date.now());

        if (!wasHealthy && this.metrics.isHealthy) {
          this.emit('reconnected');
        } else if (wasHealthy && !this.metrics.isHealthy) {
          this.emit('disconnected');
        }
      }, this.config.healthCheckInterval);
    }

    this.emit('started', { healthy: this.metrics.isHealthy });
  }

  async stop(): Promise<void> {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    for (const controller of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.emit('stopped');
  }

  // ─── Inference ─────────────────────────────────────────────

  /**
   * Generate a chat completion using the local GGUF model.
   * Primary inference method — non-streaming.
   */
  async chatCompletion(
    messages: ChatMessage[],
    options: Partial<{
      maxTokens: number;
      temperature: number;
      topP: number;
      stop: string[];
    }> = {},
  ): Promise<InferenceResult> {
    const startTime = Date.now();
    const controller = new AbortController();
    this.abortControllers.add(controller);

    try {
      const body = {
        model: this.config.modelName,
        messages,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        temperature: options.temperature ?? this.config.temperature,
        top_p: options.topP ?? this.config.topP,
        repetition_penalty: this.config.repetitionPenalty,
        stop: options.stop,
        stream: false,
      };

      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= this.config.retries; attempt++) {
        try {
          const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new Error(`Lucy server error ${response.status}: ${errorText}`);
          }

          const data = await response.json() as {
            choices: Array<{
              message: { content: string };
              finish_reason: string;
            }>;
            usage?: {
              prompt_tokens: number;
              completion_tokens: number;
              total_tokens: number;
            };
          };

          const durationMs = Date.now() - startTime;
          const content = data.choices?.[0]?.message?.content || '';
          const tokensGenerated = data.usage?.completion_tokens || this.estimateTokens(content);
          const tokensPrompt = data.usage?.prompt_tokens || 0;

          this.updateMetrics(tokensGenerated, tokensPrompt, durationMs);

          return {
            content,
            tokensGenerated,
            tokensPrompt,
            durationMs,
            tokensPerSecond: durationMs > 0 ? (tokensGenerated / durationMs) * 1000 : 0,
            finishReason: (data.choices?.[0]?.finish_reason as 'stop' | 'length') || 'stop',
          };
        } catch (err) {
          lastError = err as Error;
          if (attempt < this.config.retries) {
            await this.delay(1000 * (attempt + 1)); // Exponential backoff
          }
        }
      }

      this.metrics.errors++;
      throw lastError || new Error('All retry attempts failed');
    } finally {
      this.abortControllers.delete(controller);
    }
  }

  /**
   * Generate a streaming chat completion.
   * Yields content chunks as they arrive from the server.
   */
  async *chatCompletionStream(
    messages: ChatMessage[],
    options: Partial<{
      maxTokens: number;
      temperature: number;
      topP: number;
      stop: string[];
    }> = {},
  ): AsyncGenerator<string, void, undefined> {
    const startTime = Date.now();
    const controller = new AbortController();
    this.abortControllers.add(controller);

    try {
      const body = {
        model: this.config.modelName,
        messages,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        temperature: options.temperature ?? this.config.temperature,
        top_p: options.topP ?? this.config.topP,
        repetition_penalty: this.config.repetitionPenalty,
        stop: options.stop,
        stream: true,
      };

      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Lucy stream error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              totalTokens++;
              yield content;
            }
          } catch {
            // Skip malformed SSE chunks
          }
        }
      }

      const durationMs = Date.now() - startTime;
      this.updateMetrics(totalTokens, 0, durationMs);
    } finally {
      this.abortControllers.delete(controller);
    }
  }

  /**
   * Generate a text embedding using the local model.
   * Used for reservoir input encoding.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.modelName,
          input: text,
        }),
      });

      if (!response.ok) {
        return this.fallbackEmbedding(text);
      }

      const data = await response.json() as {
        data: Array<{ embedding: number[] }>;
      };

      return data.data?.[0]?.embedding || this.fallbackEmbedding(text);
    } catch {
      return this.fallbackEmbedding(text);
    }
  }

  // ─── Health & Metrics ──────────────────────────────────────

  async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.baseUrl}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getServerInfo(): Promise<LucyServerInfo | null> {
    try {
      const response = await fetch(`${this.config.baseUrl}/slots`);
      if (!response.ok) return null;
      const data = await response.json();
      return data as LucyServerInfo;
    } catch {
      return null;
    }
  }

  getMetrics(): InferenceMetrics {
    return { ...this.metrics };
  }

  isHealthy(): boolean {
    return this.metrics.isHealthy;
  }

  // ─── Private Helpers ───────────────────────────────────────

  private updateMetrics(tokensGen: number, tokensPrompt: number, durationMs: number): void {
    this.metrics.totalRequests++;
    this.metrics.totalTokensGenerated += tokensGen;
    this.metrics.totalTokensPrompt += tokensPrompt;
    this.metrics.totalDurationMs += durationMs;
    this.metrics.lastRequestAt = Date.now();
    this.metrics.averageTokensPerSecond =
      this.metrics.totalDurationMs > 0
        ? (this.metrics.totalTokensGenerated / this.metrics.totalDurationMs) * 1000
        : 0;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private fallbackEmbedding(text: string): number[] {
    // Simple hash-based embedding when server is unavailable
    const dim = 128;
    const embedding = new Array(dim).fill(0);
    for (let i = 0; i < text.length; i++) {
      const idx = i % dim;
      embedding[idx] += (text.charCodeAt(i) - 96) / 26;
    }
    // Normalize
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += embedding[i] ** 2;
    norm = Math.sqrt(norm) || 1;
    return embedding.map((v) => v / norm);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================
// Lucy GGUF Deployment Helper
// ============================================================

/**
 * Configuration for deploying a Lucy GGUF model via llama.cpp.
 * This generates the shell commands needed to start the server.
 */
export interface LucyDeploymentConfig {
  /** Path to the GGUF model file */
  modelPath: string;
  /** Port to listen on */
  port: number;
  /** Number of GPU layers to offload (-1 = all) */
  nGpuLayers: number;
  /** Context length */
  contextLength: number;
  /** Number of parallel slots */
  parallelSlots: number;
  /** Enable flash attention */
  flashAttention: boolean;
  /** Batch size */
  batchSize: number;
  /** Enable continuous batching */
  continuousBatching: boolean;
}

const DEFAULT_DEPLOYMENT: LucyDeploymentConfig = {
  modelPath: './models/lucy-dte.gguf',
  port: 8080,
  nGpuLayers: -1,
  contextLength: 131072,
  parallelSlots: 1,
  flashAttention: true,
  batchSize: 2048,
  continuousBatching: true,
};

/**
 * Generate the llama.cpp server launch command.
 */
export function generateLucyLaunchCommand(
  config: Partial<LucyDeploymentConfig> = {},
): string {
  const c = { ...DEFAULT_DEPLOYMENT, ...config };

  const args = [
    'llama-server',
    `--model ${c.modelPath}`,
    `--port ${c.port}`,
    `--n-gpu-layers ${c.nGpuLayers}`,
    `--ctx-size ${c.contextLength}`,
    `--parallel ${c.parallelSlots}`,
    `--batch-size ${c.batchSize}`,
    c.flashAttention ? '--flash-attn' : '',
    c.continuousBatching ? '--cont-batching' : '',
    '--host 0.0.0.0',
    '--log-disable',
  ].filter(Boolean);

  return args.join(' \\\n  ');
}

/**
 * Generate a Docker Compose service definition for Lucy.
 */
export function generateLucyDockerCompose(
  config: Partial<LucyDeploymentConfig> = {},
): string {
  const c = { ...DEFAULT_DEPLOYMENT, ...config };

  return `# Lucy GGUF Deployment — llama.cpp server
# Part of DTE Level 5 (True Autonomy) infrastructure
version: '3.8'
services:
  lucy:
    image: ghcr.io/ggml-org/llama.cpp:server
    ports:
      - "${c.port}:${c.port}"
    volumes:
      - ./models:/models
    command: >
      --model /models/lucy-dte.gguf
      --port ${c.port}
      --n-gpu-layers ${c.nGpuLayers}
      --ctx-size ${c.contextLength}
      --parallel ${c.parallelSlots}
      --batch-size ${c.batchSize}
      ${c.flashAttention ? '--flash-attn' : ''}
      ${c.continuousBatching ? '--cont-batching' : ''}
      --host 0.0.0.0
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
`;
}
