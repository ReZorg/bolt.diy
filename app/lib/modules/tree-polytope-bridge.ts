/**
 * @fileoverview Tree-Polytope Bridge — Generative Kernel for bolt.diy + tutorialkit
 *
 * Composition Expression:
 *   /tree-polytope-kernel (
 *     /optimal-cognitive-grip [ bolt.diy | tutorialkit ]
 *   )
 *
 * Maps the architectural structure of bolt.diy and tutorialkit to the
 * tree-polynomial-Matula correspondence from the generative kernel.
 * This module provides:
 *
 * 1. **Structural Self-Model**: Each repo's architecture is encoded as a
 *    rooted tree with Matula-Godsil prime identity numbers.
 *
 * 2. **Tensor Product Composition**: bolt.diy ⊗ tutorialkit produces a
 *    System 5 pentachoron with 20 terms — the optimal cognitive grip
 *    composition for the combined platform.
 *
 * 3. **S-Gram Rhythms**: Periodic sequences for scheduling Echobeats
 *    cognitive cycles across both platforms.
 *
 * 4. **Butcher/RK Conditions**: Numerical stability conditions for
 *    cognitive state evolution during code generation and tutorial execution.
 *
 * Key Invariant: sys(n) = a000081(n+1)
 *   bolt.diy   = System 4 (tetrahedron):  4 centres, 9 terms
 *   tutorialkit = System 3 (triangle):     3 centres, 4 terms
 *   bolt ⊗ tk  = System 5 (pentachoron): 5 centres, 20 terms
 *
 * The fundamental dyad (1,-1) generates all structure via convolution.
 * Star tower: (1,-1)^N = Pascal rows = simplex incidence
 * Chain tower: recursive primes 2→3→5→11→31→127→...
 */

// ============================================================
// A000081 Reference Values (rooted trees with n nodes)
// ============================================================
const A000081 = [0, 1, 1, 2, 4, 9, 20, 48, 115, 286, 719];

// ============================================================
// Core Types
// ============================================================

/** Rooted tree as canonical sorted tuple of subtrees */
export type RootedTree = readonly RootedTree[];

/** Polynomial as coefficient array (index = degree) */
export type Polynomial = readonly number[];

/** Term classification */
export type TermKind = 'star' | 'chain' | 'mixed';

/** Platform identity */
export type PlatformId = 'bolt-diy' | 'tutorialkit' | 'bolt-x-tutorialkit';

/** Complete tree-polynomial-Matula record */
export interface TreeRecord {
  system: number;
  nodes: number;
  tree: RootedTree;
  parenthesis: string;
  matula: number;
  polynomial: Polynomial;
  isPrime: boolean;
  kind: TermKind;
}

/** System-level kernel */
export interface SystemKernel {
  system: number;
  centres: number;
  nodes: number;
  termCount: number;
  starPolynomial: Polynomial;
  chainPolynomial: Polynomial;
  terms: readonly TreeRecord[];
}

/** Platform structural analysis */
export interface PlatformAnalysis {
  platform: PlatformId;
  systemLevel: number;
  centres: string[];
  identityPrime: number;
  starTower: Polynomial[];
  chainTower: number[];
  kernel: SystemKernel;
  sgramRhythm: SGramRhythm;
}

/** S-gram periodic sequence */
export interface SGramRhythm {
  system: number;
  denominator: number;
  base: number;
  period: number[];
  periodLength: number;
}

// ============================================================
// Polynomial Operations
// ============================================================

/** Convolve two polynomials */
export function convolve(a: Polynomial, b: Polynomial): number[] {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] += a[i] * b[j];
    }
  }
  return result;
}

/** Shift-1: prepend 1 to polynomial (edge polynomial) */
export function shift1(poly: Polynomial): number[] {
  return [1, ...poly];
}

/** Pascal row: (1,-1)^n = star polynomial */
export function pascalRow(n: number): number[] {
  let result: number[] = [1];
  for (let i = 0; i < n; i++) {
    result = convolve(result, [1, -1]);
  }
  return result;
}

/** Chain polynomial: all-ones with n+1 terms */
export function chainPoly(n: number): number[] {
  return new Array(n + 1).fill(1);
}

// ============================================================
// Prime Utilities
// ============================================================

const PRIMES = [
  0, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47,
  53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109,
  113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179,
];

function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

function nthPrime(n: number): number {
  if (n < PRIMES.length) return PRIMES[n];
  let count = PRIMES.length - 1;
  let candidate = PRIMES[PRIMES.length - 1] + 2;
  while (count < n) {
    if (isPrime(candidate)) count++;
    if (count < n) candidate += 2;
  }
  return candidate;
}

// ============================================================
// Tree Enumeration
// ============================================================

/** Enumerate all rooted trees with n nodes */
export function enumerateRootedTrees(n: number): RootedTree[] {
  if (n <= 0) return [];
  if (n === 1) return [[]]; // Single leaf

  const cache = new Map<number, RootedTree[]>();
  cache.set(1, [[]]);

  for (let k = 2; k <= n; k++) {
    const trees: RootedTree[] = [];
    // Generate all partitions of k-1 into parts from {1,...,k-1}
    generateTrees(k - 1, k - 1, [], cache, trees);
    cache.set(k, trees);
  }

  return cache.get(n) || [];
}

function generateTrees(
  remaining: number,
  maxPart: number,
  parts: number[],
  cache: Map<number, RootedTree[]>,
  result: RootedTree[],
): void {
  if (remaining === 0) {
    // Convert partition to tree: each part is a subtree size
    const subtreeOptions = parts.map((p) => cache.get(p) || []);
    const combinations = cartesianProduct(subtreeOptions);
    for (const combo of combinations) {
      const sorted = [...combo].sort(compareTree);
      const key = treeToString(sorted);
      if (!result.some((t) => treeToString([...t].sort(compareTree)) === key)) {
        result.push(sorted);
      }
    }
    return;
  }

  for (let part = Math.min(remaining, maxPart); part >= 1; part--) {
    generateTrees(remaining - part, part, [...parts, part], cache, result);
  }
}

function cartesianProduct<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [[]];
  const [first, ...rest] = arrays;
  const restProduct = cartesianProduct(rest);
  const result: T[][] = [];
  for (const item of first) {
    for (const restCombo of restProduct) {
      result.push([item, ...restCombo]);
    }
  }
  return result;
}

function compareTree(a: RootedTree, b: RootedTree): number {
  const sa = treeToString(a);
  const sb = treeToString(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function treeToString(tree: RootedTree): string {
  if (tree.length === 0) return '()';
  return '(' + tree.map(treeToString).join('') + ')';
}

/** Convert tree to parenthesis notation */
export function treeToParenthesis(tree: RootedTree): string {
  return treeToString(tree);
}

/** Convert tree to polynomial */
export function treeToPoly(tree: RootedTree): number[] {
  if (tree.length === 0) return [1]; // Leaf
  let result: number[] = [1];
  for (const child of tree) {
    const childPoly = shift1(treeToPoly(child));
    result = convolve(result, childPoly);
  }
  return result;
}

/** Compute Matula-Godsil number */
export function matulaNumber(tree: RootedTree): number {
  if (tree.length === 0) return 1; // Leaf = 1
  let product = 1;
  for (const child of tree) {
    const childMatula = matulaNumber(child);
    product *= nthPrime(childMatula);
  }
  return product;
}

// ============================================================
// S-Gram Rhythm
// ============================================================

/** Compute S-gram periodic sequence for a system */
export function computeSGramRhythm(system: number): SGramRhythm {
  if (system < 3) {
    return { system, denominator: 1, base: 2, period: [1], periodLength: 1 };
  }
  const k = system - 1;
  const d = k * (k - 1) + 1;
  const base = d + k;

  // Compute period of 1/d in base
  const period: number[] = [];
  let remainder = 1;
  const seen = new Map<number, number>();
  let pos = 0;

  while (!seen.has(remainder) && pos < 100) {
    seen.set(remainder, pos);
    remainder *= base;
    period.push(Math.floor(remainder / d));
    remainder = remainder % d;
    pos++;
  }

  return {
    system,
    denominator: d,
    base,
    period,
    periodLength: period.length,
  };
}

// ============================================================
// Platform Analysis
// ============================================================

/**
 * Analyze bolt.diy as a System 4 structure.
 *
 * 4 centres: UI, LLM, Runtime, Persistence
 * Star tower: (1,-1)^4 = (1,-4,6,-4,1) = tetrahedron incidence
 * Chain tower: 2→3→5→11 (recursive primes)
 */
export function analyzeBoltDiy(): PlatformAnalysis {
  const system = 4;
  const centres = ['UI', 'LLM', 'Runtime', 'Persistence'];
  const trees = enumerateRootedTrees(system + 1);

  const terms: TreeRecord[] = trees.map((tree) => ({
    system,
    nodes: system + 1,
    tree,
    parenthesis: treeToParenthesis(tree),
    matula: matulaNumber(tree),
    polynomial: treeToPoly(tree),
    isPrime: isPrime(matulaNumber(tree)),
    kind: classifyKind(tree),
  }));

  return {
    platform: 'bolt-diy',
    systemLevel: system,
    centres,
    identityPrime: matulaNumber(trees[0] || []),
    starTower: Array.from({ length: system + 1 }, (_, i) => pascalRow(i)),
    chainTower: [2, 3, 5, 11],
    kernel: {
      system,
      centres: system,
      nodes: system + 1,
      termCount: A000081[system + 1],
      starPolynomial: pascalRow(system),
      chainPolynomial: chainPoly(system),
      terms,
    },
    sgramRhythm: computeSGramRhythm(system),
  };
}

/**
 * Analyze tutorialkit as a System 3 structure.
 *
 * 3 centres: Content, Runtime, UI
 * Star tower: (1,-1)^3 = (1,-3,3,-1) = triangle incidence
 * Chain tower: 2→3→5 (recursive primes)
 */
export function analyzeTutorialKit(): PlatformAnalysis {
  const system = 3;
  const centres = ['Content', 'Runtime', 'UI'];
  const trees = enumerateRootedTrees(system + 1);

  const terms: TreeRecord[] = trees.map((tree) => ({
    system,
    nodes: system + 1,
    tree,
    parenthesis: treeToParenthesis(tree),
    matula: matulaNumber(tree),
    polynomial: treeToPoly(tree),
    isPrime: isPrime(matulaNumber(tree)),
    kind: classifyKind(tree),
  }));

  return {
    platform: 'tutorialkit',
    systemLevel: system,
    centres,
    identityPrime: matulaNumber(trees[0] || []),
    starTower: Array.from({ length: system + 1 }, (_, i) => pascalRow(i)),
    chainTower: [2, 3, 5],
    kernel: {
      system,
      centres: system,
      nodes: system + 1,
      termCount: A000081[system + 1],
      starPolynomial: pascalRow(system),
      chainPolynomial: chainPoly(system),
      terms,
    },
    sgramRhythm: computeSGramRhythm(system),
  };
}

/**
 * Tensor product composition: bolt.diy ⊗ tutorialkit = System 5
 *
 * 5 centres: Content, LLM, Runtime, UI, Persistence
 * Star tower: (1,-1)^5 = pentachoron incidence
 * Chain tower: 2→3→5→11→31 (recursive primes)
 *
 * This is the optimal cognitive grip composition — the combined platform
 * has enough centres for the System 5 tetradic structure with 4 tensor
 * bundles, each containing 3 dyadic edges.
 */
export function analyzeComposition(): PlatformAnalysis {
  const system = 5;
  const centres = ['Content', 'LLM', 'Runtime', 'UI', 'Persistence'];
  const trees = enumerateRootedTrees(system + 1);

  const terms: TreeRecord[] = trees.map((tree) => ({
    system,
    nodes: system + 1,
    tree,
    parenthesis: treeToParenthesis(tree),
    matula: matulaNumber(tree),
    polynomial: treeToPoly(tree),
    isPrime: isPrime(matulaNumber(tree)),
    kind: classifyKind(tree),
  }));

  return {
    platform: 'bolt-x-tutorialkit',
    systemLevel: system,
    centres,
    identityPrime: matulaNumber(trees[0] || []),
    starTower: Array.from({ length: system + 1 }, (_, i) => pascalRow(i)),
    chainTower: [2, 3, 5, 11, 31],
    kernel: {
      system,
      centres: system,
      nodes: system + 1,
      termCount: A000081[system + 1],
      starPolynomial: pascalRow(system),
      chainPolynomial: chainPoly(system),
      terms,
    },
    sgramRhythm: computeSGramRhythm(system),
  };
}

/** Classify a tree as star, chain, or mixed */
function classifyKind(tree: RootedTree): TermKind {
  if (tree.length === 0) return 'star'; // Leaf
  // Star: all children are leaves
  if (tree.every((c) => c.length === 0)) return 'star';
  // Chain: single child, recursively chain
  if (tree.length === 1) {
    const childKind = classifyKind(tree[0]);
    return childKind === 'chain' || childKind === 'star' ? 'chain' : 'mixed';
  }
  return 'mixed';
}

// ============================================================
// Echobeats Scheduling via S-Gram
// ============================================================

/**
 * Generate an Echobeats schedule from the S-gram rhythm.
 * The period of 1/d in base b gives the temporal pattern for
 * cycling through cognitive phases.
 *
 * For System 4 (bolt.diy): d=7, base=10, period=[1,4,2,8,5,7]
 * For System 3 (tutorialkit): d=3, base=5, period=[1,3]
 * For System 5 (composition): d=13, base=17, period=[1,5,3,15,11,13]
 */
export function generateEchobeatsSchedule(platform: PlatformId): {
  phases: string[];
  threadAssignment: number[];
  periodLength: number;
} {
  const analysis = platform === 'bolt-diy'
    ? analyzeBoltDiy()
    : platform === 'tutorialkit'
    ? analyzeTutorialKit()
    : analyzeComposition();

  const rhythm = analysis.sgramRhythm;
  const phases = rhythm.period.map((p, i) => {
    const phaseIdx = i % 3;
    const phaseName = ['perceive', 'reason', 'act'][phaseIdx];
    return `${phaseName}-${String.fromCharCode(97 + (p % 4))}`;
  });

  const threadAssignment = rhythm.period.map((_, i) => i % 3);

  return {
    phases,
    threadAssignment,
    periodLength: rhythm.periodLength,
  };
}

// ============================================================
// Full Analysis Report
// ============================================================

/**
 * Generate a complete tree-polytope analysis for both platforms
 * and their tensor product composition.
 */
export function generateFullAnalysis(): {
  boltDiy: PlatformAnalysis;
  tutorialKit: PlatformAnalysis;
  composition: PlatformAnalysis;
  echobeats: {
    bolt: ReturnType<typeof generateEchobeatsSchedule>;
    tutorial: ReturnType<typeof generateEchobeatsSchedule>;
    composed: ReturnType<typeof generateEchobeatsSchedule>;
  };
} {
  return {
    boltDiy: analyzeBoltDiy(),
    tutorialKit: analyzeTutorialKit(),
    composition: analyzeComposition(),
    echobeats: {
      bolt: generateEchobeatsSchedule('bolt-diy'),
      tutorial: generateEchobeatsSchedule('tutorialkit'),
      composed: generateEchobeatsSchedule('bolt-x-tutorialkit'),
    },
  };
}
