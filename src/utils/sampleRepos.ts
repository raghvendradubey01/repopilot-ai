import type {
  AIAnalysisPlan,
  CodeSelectionContext,
  FilePatchChange,
  QuickAgentActionType,
  RepoFile,
  SampleRepositoryPreset,
  StructuredAgentOutput,
} from '../types/repopilot';
import { analyzeRepositoryStructure } from './repoAnalyzer';
import { applySearchReplaceBlocks } from './patchValidator';
import type { RawArchiveEntry } from './securityValidator';

function makeFile(
  path: string,
  content: string,
  language: RepoFile['language'] = 'python',
  isTestFile = false
): RepoFile {
  return {
    path,
    content,
    sizeBytes: new TextEncoder().encode(content).length,
    language,
    isTestFile,
  };
}

export const SAMPLE_REPOSITORIES: SampleRepositoryPreset[] = [
  {
    id: 'billing-engine-py',
    name: 'billing-engine-py',
    tagline: 'Python E-Commerce Invoice & Tiered Discount Calculator',
    description:
      'Contains two subtle bugs in billing/calculator.py: an off-by-one boundary defect in bulk discount tiers (> instead of >=) and sales tax computed on the pre-discount subtotal instead of the discounted net amount.',
    defaultTask:
      'Fix the off-by-one tier boundary bug in calculate_tier_discount when quantity is exactly 10 or 50, and ensure calculate_invoice_total applies sales tax after subtracting the discount.',
    suggestedTasks: [
      'Fix the off-by-one tier boundary bug in calculate_tier_discount when quantity is exactly 10 or 50, and ensure calculate_invoice_total applies sales tax after subtracting the discount.',
      'Fix bulk discount boundary first, then let test runner verify invoice tax order (Triggers 1-Retry Repair Loop Demo).',
      'Add a currency: str = "USD" field to LineItem and InvoiceSummary in billing/models.py and pass it through calculate_invoice_total in billing/calculator.py (Multi-File Task).',
      'Ensure LineItem.gross_amount raises ValueError when quantity is negative (No-Change Needed Task).',
      'Update the discount logic for better margins (Ambiguous Task — Triggers Clarifying Question).',
    ],
    files: [
      makeFile(
        'billing/__init__.py',
        `"""Billing Engine package for tiered B2B invoice calculation."""

from .calculator import calculate_invoice_total, calculate_tier_discount
from .models import InvoiceSummary, LineItem

__all__ = [
    "LineItem",
    "InvoiceSummary",
    "calculate_tier_discount",
    "calculate_invoice_total",
]
`
      ),
      makeFile(
        'billing/models.py',
        `from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class LineItem:
    sku: str
    unit_price: float
    quantity: int

    @property
    def gross_amount(self) -> float:
        if self.quantity < 0:
            raise ValueError("Quantity cannot be negative")
        return round(self.unit_price * self.quantity, 2)


@dataclass(frozen=True)
class InvoiceSummary:
    subtotal: float
    discount_amount: float
    tax_amount: float
    total: float
    applied_rate: float
`
      ),
      makeFile(
        'billing/calculator.py',
        `from typing import Iterable
from .models import InvoiceSummary, LineItem


def calculate_tier_discount(subtotal: float, total_quantity: int) -> tuple[float, float]:
    """
    Returns (discount_amount, discount_rate) based on total item quantity:
    - 50 or more units: 15% discount (0.15)
    - 10 to 49 units: 10% discount (0.10)
    - fewer than 10 units: 0% discount (0.0)
    """
    if subtotal <= 0 or total_quantity <= 0:
        return 0.0, 0.0

    # BUG 1: Off-by-one strict inequality misses exact tier boundaries 50 and 10
    if total_quantity > 50:
        rate = 0.15
    elif total_quantity > 10:
        rate = 0.10
    else:
        rate = 0.0

    return round(subtotal * rate, 2), rate


def calculate_invoice_total(items: Iterable[LineItem], tax_rate: float = 0.08) -> InvoiceSummary:
    """
    Computes invoice summary with tiered volume discount and sales tax.
    Sales tax must be calculated on the discounted net subtotal.
    """
    item_list = list(items)
    if tax_rate < 0:
        raise ValueError("tax_rate cannot be negative")

    subtotal = round(sum(item.gross_amount for item in item_list), 2)
    total_qty = sum(item.quantity for item in item_list)

    discount_amount, applied_rate = calculate_tier_discount(subtotal, total_qty)
    discounted_subtotal = round(subtotal - discount_amount, 2)

    # BUG 2: Tax is erroneously computed on gross subtotal instead of discounted_subtotal
    tax_amount = round(subtotal * tax_rate, 2)
    total = round(discounted_subtotal + tax_amount, 2)

    return InvoiceSummary(
        subtotal=subtotal,
        discount_amount=discount_amount,
        tax_amount=tax_amount,
        total=total,
        applied_rate=applied_rate,
    )
`
      ),
      makeFile(
        'tests/test_calculator.py',
        `import pytest
from billing.calculator import calculate_invoice_total, calculate_tier_discount
from billing.models import LineItem


def test_no_discount_under_ten_units():
    items = [LineItem(sku="BASIC-1", unit_price=20.0, quantity=5)]
    summary = calculate_invoice_total(items, tax_rate=0.10)
    assert summary.subtotal == 100.00
    assert summary.discount_amount == 0.00
    assert summary.tax_amount == 10.00
    assert summary.total == 110.00


def test_exact_ten_units_tier_boundary():
    discount, rate = calculate_tier_discount(subtotal=200.0, total_quantity=10)
    assert rate == 0.10
    assert discount == 20.00


def test_exact_fifty_units_tier_boundary():
    discount, rate = calculate_tier_discount(subtotal=1000.0, total_quantity=50)
    assert rate == 0.15
    assert discount == 150.00


def test_tax_computed_on_discounted_subtotal():
    items = [LineItem(sku="PRO-NODE", unit_price=50.0, quantity=10)]
    summary = calculate_invoice_total(items, tax_rate=0.10)
    # Subtotal = 500.00, 10% discount = 50.00 -> net = 450.00
    # 10% tax on 450.00 should be 45.00, total = 495.00
    assert summary.discount_amount == 50.00
    assert summary.tax_amount == 45.00
    assert summary.total == 495.00


def test_negative_tax_rate_raises():
    items = [LineItem(sku="PRO-NODE", unit_price=25.0, quantity=2)]
    with pytest.raises(ValueError):
        calculate_invoice_total(items, tax_rate=-0.05)
`,
        'python',
        true
      ),
      makeFile(
        'pyproject.toml',
        `[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.build_meta"

[project]
name = "billing-engine-py"
version = "0.2.1"
description = "Tiered invoice & tax calculation library"
requires-python = ">=3.10"

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
`,
        'toml',
        false
      ),
      makeFile(
        'README.md',
        `# billing-engine-py

Deterministic B2B invoice calculator supporting quantity discount tiers and regional sales tax calculation.

## Known Issues
1. \`calculate_tier_discount\` uses \`>\` instead of \`>=\` for the 10-unit and 50-unit thresholds.
2. \`calculate_invoice_total\` calculates \`tax_amount\` on \`subtotal\` rather than \`discounted_subtotal\`.
`,
        'markdown',
        false
      ),
    ],
  },
  {
    id: 'rate-limiter-py',
    name: 'rate-limiter-py',
    tagline: 'Token Bucket Rate Limiter with Fractional Refill Defect',
    description:
      'TokenBucket in limiter/bucket.py uses integer floor division (//) during token replenishment, dropping sub-second refills, and fails to reject zero or negative token consumption requests.',
    defaultTask:
      'Fix TokenBucket._refill to use floating-point division instead of floor division (//) and raise ValueError in consume() when requested tokens <= 0.',
    suggestedTasks: [
      'Fix TokenBucket._refill to use floating-point division instead of floor division (//) and raise ValueError in consume() when requested tokens <= 0.',
      'Check if TokenBucket.__init__ already validates negative capacity (No-Change Needed Task).',
    ],
    files: [
      makeFile(
        'limiter/__init__.py',
        `from .bucket import TokenBucket

__all__ = ["TokenBucket"]
`
      ),
      makeFile(
        'limiter/bucket.py',
        `class TokenBucket:
    """
    Deterministic token bucket rate limiter.
    """

    def __init__(self, capacity: float, refill_rate_per_sec: float, initial_time: float = 0.0) -> None:
        if capacity <= 0 or refill_rate_per_sec <= 0:
            raise ValueError("capacity and refill_rate_per_sec must be positive")
        self.capacity = float(capacity)
        self.refill_rate = float(refill_rate_per_sec)
        self.tokens = float(capacity)
        self.last_refill = float(initial_time)

    def _refill(self, now: float) -> None:
        if now < self.last_refill:
            return
        elapsed = now - self.last_refill
        # BUG 1: Floor division // discards fractional elapsed refills
        added = (elapsed * self.refill_rate) // 1
        self.tokens = min(self.capacity, self.tokens + added)
        self.last_refill = now

    def consume(self, requested: float, now: float) -> bool:
        # BUG 2: Missing validation for requested <= 0
        self._refill(now)
        if self.tokens >= requested:
            self.tokens = round(self.tokens - requested, 6)
            return True
        return False
`
      ),
      makeFile(
        'tests/test_bucket.py',
        `import pytest
from limiter.bucket import TokenBucket


def test_initial_capacity_consumption():
    bucket = TokenBucket(capacity=10.0, refill_rate_per_sec=2.0, initial_time=0.0)
    assert bucket.consume(6.0, now=0.0) is True
    assert bucket.tokens == 4.0


def test_fractional_second_refill():
    bucket = TokenBucket(capacity=5.0, refill_rate_per_sec=1.0, initial_time=0.0)
    assert bucket.consume(5.0, now=0.0) is True
    assert bucket.tokens == 0.0
    # After 0.5s at 1 token/sec, 0.5 tokens should be available
    assert bucket.consume(0.5, now=0.5) is True


def test_zero_or_negative_consume_raises():
    bucket = TokenBucket(capacity=5.0, refill_rate_per_sec=1.0, initial_time=0.0)
    with pytest.raises(ValueError):
        bucket.consume(0, now=1.0)
    with pytest.raises(ValueError):
        bucket.consume(-2.0, now=1.0)
`,
        'python',
        true
      ),
      makeFile(
        'pyproject.toml',
        `[project]
name = "rate-limiter-py"
version = "0.1.0"
description = "Token bucket rate limiter"
requires-python = ">=3.10"
`,
        'toml',
        false
      ),
    ],
  },
  {
    id: 'metrics-aggregator-py',
    name: 'metrics-aggregator-py',
    tagline: 'Latency Percentile Aggregator with Missing Import & Caller Chain',
    description:
      'metrics/stats.py calls math.ceil() without importing math, causing NameError when metrics/reporter.py generates SLA reports.',
    defaultTask:
      'Fix the NameError in metrics/stats.py caused by missing math import when computing percentile indices.',
    suggestedTasks: [
      'Fix the NameError in metrics/stats.py caused by missing math import when computing percentile indices.',
      'Update both metrics/stats.py and metrics/reporter.py to include sample_count in the SLA report dictionary (Multi-File Task).',
    ],
    files: [
      makeFile(
        'metrics/__init__.py',
        `from .stats import compute_percentile
from .reporter import build_sla_report

__all__ = ["compute_percentile", "build_sla_report"]
`
      ),
      makeFile(
        'metrics/stats.py',
        `from typing import Sequence


def compute_percentile(samples: Sequence[float], percentile: float) -> float:
    """
    Computes the nearest-rank percentile (0 < percentile <= 100) for a sample list.
    """
    if not samples:
        raise ValueError("samples cannot be empty")
    if percentile <= 0 or percentile > 100:
        raise ValueError("percentile must be in (0, 100]")

    ordered = sorted(float(x) for x in samples)
    # BUG: math.ceil is called without importing math
    rank_idx = max(0, math.ceil((percentile / 100.0) * len(ordered)) - 1)
    return round(ordered[rank_idx], 3)
`
      ),
      makeFile(
        'metrics/reporter.py',
        `from typing import Dict, Sequence
from .stats import compute_percentile


def build_sla_report(latencies_ms: Sequence[float], sla_limit_ms: float = 200.0) -> Dict[str, object]:
    p50 = compute_percentile(latencies_ms, 50.0)
    p95 = compute_percentile(latencies_ms, 95.0)
    return {
        "p50_ms": p50,
        "p95_ms": p95,
        "within_sla": p95 <= sla_limit_ms,
    }
`
      ),
      makeFile(
        'tests/test_stats.py',
        `import pytest
from metrics.reporter import build_sla_report
from metrics.stats import compute_percentile


def test_compute_p95_nearest_rank():
    samples = [10.0, 20.0, 30.0, 40.0, 100.0]
    assert compute_percentile(samples, 95.0) == 100.0


def test_build_sla_report_within_limit():
    report = build_sla_report([15.0, 25.0, 40.0, 80.0], sla_limit_ms=100.0)
    assert report["p95_ms"] == 80.0
    assert report["within_sla"] is True
`,
        'python',
        true
      ),
      makeFile(
        'pyproject.toml',
        `[project]
name = "metrics-aggregator-py"
version = "0.1.0"
description = "Latency percentile & SLA reporter"
requires-python = ">=3.10"
`,
        'toml',
        false
      ),
    ],
  },
  {
    id: 'ts-cart-service',
    name: 'ts-cart-service',
    tagline: 'TypeScript / Node.js Shopping Cart & Promo Engine',
    description:
      'Multi-language TypeScript repository where src/cart.ts fails to cap percentage coupons at 100% and uses case-sensitive coupon matching instead of normalizing via normalizeCode from src/promo.ts.',
    defaultTask:
      'Fix applyPromoDiscount in src/cart.ts so coupon codes are normalized with normalizeCode() and percentage discounts over 100% are capped at the cart subtotal.',
    suggestedTasks: [
      'Fix applyPromoDiscount in src/cart.ts so coupon codes are normalized with normalizeCode() and percentage discounts over 100% are capped at the cart subtotal.',
      'Add a currency field to CartSummary in src/promo.ts and return it from calculateCartSummary in src/cart.ts (Multi-File TypeScript Task).',
    ],
    files: [
      makeFile(
        'src/promo.ts',
        `export interface CartItem {
  id: string;
  priceCents: number;
  qty: number;
}

export interface PromoRule {
  code: string;
  percentOff: number;
}

export interface CartSummary {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

export function normalizeCode(rawCode: string): string {
  return rawCode.trim().toUpperCase();
}
`,
        'typescript',
        false
      ),
      makeFile(
        'src/cart.ts',
        `import { CartItem, CartSummary, PromoRule, normalizeCode } from './promo';

export function applyPromoDiscount(
  subtotalCents: number,
  inputCode: string,
  rules: PromoRule[]
): number {
  if (subtotalCents <= 0 || !inputCode) return 0;
  // BUG 1: Matches raw inputCode without normalizeCode(inputCode)
  const matched = rules.find((r) => r.code === inputCode);
  if (!matched || matched.percentOff <= 0) return 0;

  // BUG 2: Does not cap percentOff at 100, allowing negative totals
  const rawDiscount = Math.round((subtotalCents * matched.percentOff) / 100);
  return rawDiscount;
}

export function calculateCartSummary(
  items: CartItem[],
  promoCode = '',
  rules: PromoRule[] = []
): CartSummary {
  const subtotalCents = items.reduce(
    (acc, item) => acc + item.priceCents * Math.max(0, item.qty),
    0
  );
  const discountCents = applyPromoDiscount(subtotalCents, promoCode, rules);
  const totalCents = Math.max(0, subtotalCents - discountCents);
  return {
    subtotalCents,
    discountCents,
    totalCents,
  };
}
`,
        'typescript',
        false
      ),
      makeFile(
        'tests/cart.test.ts',
        `import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPromoDiscount, calculateCartSummary } from '../src/cart';

test('normalizes lowercase promo code and caps discount at subtotal', () => {
  const rules = [
    { code: 'SAVE20', percentOff: 20 },
    { code: 'OVER100', percentOff: 150 },
  ];
  assert.equal(applyPromoDiscount(1000, '  save20 ', rules), 200);
  assert.equal(applyPromoDiscount(1000, 'over100', rules), 1000);
  const summary = calculateCartSummary(
    [{ id: 'sku-1', priceCents: 500, qty: 2 }],
    'save20',
    rules
  );
  assert.equal(summary.totalCents, 800);
});
`,
        'typescript',
        true
      ),
      makeFile(
        'package.json',
        `{
  "name": "ts-cart-service",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "tsx --test tests/cart.test.ts",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0"
  }
}
`,
        'json',
        false
      ),
      makeFile(
        'tsconfig.json',
        `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true
  }
}
`,
        'json',
        false
      ),
    ],
  },
];

export function getMaliciousDemoArchiveEntries(): RawArchiveEntry[] {
  return [
    {
      path: '../../etc/passwd',
      content: 'root:x:0:0:root:/root:/bin/bash',
      uncompressedBytes: 32,
    },
    {
      path: 'app/.env.production',
      content: 'OPENAI_API_KEY="sk-live-9876543210abcdefghijk123456"\n',
      uncompressedBytes: 54,
    },
    {
      path: 'app/config.py',
      content:
        'GEMINI_API_KEY = "AIzaSyD-99887766554433221100_aabbccddeeff"\nDEBUG = True\n',
      uncompressedBytes: 76,
    },
    {
      path: 'app/payload.exe',
      content: 'MZ\x90\x00\x03\x00\x00\x00',
      uncompressedBytes: 1024,
    },
  ];
}

/**
 * Detects whether a task prompt is ambiguous or underspecified so the agent
 * asks a clarifying question instead of guessing.
 */
export function detectAmbiguousTask(
  taskDescription: string,
  files: readonly RepoFile[],
  actionType?: QuickAgentActionType
): { isAmbiguous: boolean; clarifyingQuestion?: string } {
  if (actionType && actionType !== 'custom') {
    return { isAmbiguous: false };
  }

  const trimmed = taskDescription.trim();
  const lower = trimmed.toLowerCase();

  if (lower.includes('developer clarification:')) {
    return { isAmbiguous: false };
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const mentionsAmbiguousPreset =
    lower.includes('for better margins') ||
    lower.includes('ambiguous task') ||
    lower === 'fix the bug' ||
    lower === 'fix bug' ||
    lower === 'improve the code' ||
    lower === 'make it faster' ||
    lower === 'optimize performance' ||
    lower === 'update the discount logic';

  const mentionsKnownSymbolOrFile = files.some((f) => {
    const base =
      f.path
        .split('/')
        .pop()
        ?.replace(/\.[a-z0-9]+$/i, '') || '';
    return (
      lower.includes(f.path.toLowerCase()) ||
      (base.length >= 4 && lower.includes(base.toLowerCase())) ||
      lower.includes('calculate_') ||
      lower.includes('tokenbucket') ||
      lower.includes('lineitem') ||
      lower.includes('compute_percentile') ||
      lower.includes('applypromodiscount') ||
      lower.includes('refill')
    );
  });

  if (mentionsAmbiguousPreset || (wordCount <= 4 && !mentionsKnownSymbolOrFile)) {
    return {
      isAmbiguous: true,
      clarifyingQuestion:
        'Your request does not specify the exact acceptance criteria or target behavior. Could you clarify: (1) Which function or module should be modified, and (2) What exact input/output rule or threshold you expect (for example, inclusive >= 10 and >= 50 unit discount tiers in billing/calculator.py)?',
    };
  }

  return { isAmbiguous: false };
}

/**
 * Detects tasks where the requested behavior or invariant is ALREADY present
 * in the repository so the correct result is to make no changes.
 */
export function detectNoChangeNeededTask(
  taskDescription: string,
  files: readonly RepoFile[],
  actionType?: QuickAgentActionType
): { isNoChange: boolean; explanation?: string; evidenceFile?: string } {
  const lower = taskDescription.toLowerCase();

  if (actionType === 'explain-code' || actionType === 'find-bug') {
    const targetFile = files[0]?.path || 'repository';
    return {
      isNoChange: true,
      evidenceFile: targetFile,
      explanation:
        actionType === 'explain-code'
          ? `Explained control flow, data structures, and caller/callee relationships in ${targetFile}. No code modifications requested.`
          : `Static inspection of ${targetFile} completed. Identified defect locations and invariants without mutating files yet (use "Fix Bug" to generate the surgical patch).`,
    };
  }

  if (
    lower.includes('no-change needed') ||
    (lower.includes('gross_amount') &&
      lower.includes('valueerror') &&
      lower.includes('quantity') &&
      lower.includes('negative'))
  ) {
    const modelsFile = files.find((f) => f.path === 'billing/models.py');
    if (
      modelsFile &&
      modelsFile.content.includes('if self.quantity < 0:') &&
      modelsFile.content.includes('raise ValueError("Quantity cannot be negative")')
    ) {
      return {
        isNoChange: true,
        evidenceFile: 'billing/models.py',
        explanation:
          'Inspected billing/models.py (lines 12-13): LineItem.gross_amount already checks `if self.quantity < 0:` and raises `ValueError("Quantity cannot be negative")`. No code changes are required.',
      };
    }
  }

  if (
    lower.includes('__init__') &&
    lower.includes('negative capacity') &&
    files.some((f) => f.path === 'limiter/bucket.py')
  ) {
    const bucketFile = files.find((f) => f.path === 'limiter/bucket.py');
    if (
      bucketFile &&
      bucketFile.content.includes('if capacity <= 0 or refill_rate_per_sec <= 0:')
    ) {
      return {
        isNoChange: true,
        evidenceFile: 'limiter/bucket.py',
        explanation:
          'Inspected limiter/bucket.py (lines 7-8): TokenBucket.__init__ already validates `if capacity <= 0 or refill_rate_per_sec <= 0: raise ValueError(...)`. No changes are required.',
      };
    }
  }

  return { isNoChange: false };
}

export function convertStructuredOutputToLegacyPlanAndChanges(
  structured: StructuredAgentOutput,
  originalFiles: readonly RepoFile[],
  providerLabel: string,
  modelLabel: string,
  inspectedFiles?: string[]
): { plan: AIAnalysisPlan; changes: FilePatchChange[] } {
  const fileMap = new Map(originalFiles.map((f) => [f.path, f.content]));
  const changes: FilePatchChange[] = [];

  for (const patchItem of structured.proposed_patch) {
    if (patchItem.operation === 'no_change') continue;
    const orig = fileMap.get(patchItem.file_path) ?? '';
    let proposed = orig;

    if (
      patchItem.search_replace_blocks &&
      patchItem.search_replace_blocks.length > 0
    ) {
      const applied = applySearchReplaceBlocks(
        orig,
        patchItem.search_replace_blocks
      );
      if (applied.success) {
        proposed = applied.content;
      } else if (patchItem.patched_content) {
        proposed = patchItem.patched_content;
      }
    } else if (patchItem.patched_content) {
      proposed = patchItem.patched_content;
    }

    changes.push({
      filePath: patchItem.file_path,
      explanation: patchItem.explanation,
      originalContent: orig,
      proposedContent: proposed,
    });
  }

  const steps: AIAnalysisPlan['steps'] =
    changes.length > 0
      ? [
          ...changes.map((c, idx) => ({
            stepNumber: idx + 1,
            title: `Modify ${c.filePath}`,
            targetFile: c.filePath,
            rationale: c.explanation,
            operation: 'modify' as const,
          })),
          {
            stepNumber: changes.length + 1,
            title: `Run ${structured.repository_findings.test_framework || 'suite'} verification`,
            targetFile:
              structured.repository_findings.existing_tests[0] || 'tests/',
            rationale: `Execute ${
              structured.tests_to_run.targeted_tests.join(', ') ||
              structured.tests_to_run.full_suite_command
            }`,
            operation: 'verify' as const,
          },
        ]
      : [
          {
            stepNumber: 1,
            title: structured.clarifying_question
              ? 'Await user clarification on ambiguous requirements'
              : 'No file modifications required',
            targetFile:
              structured.root_cause.evidence_files[0] ||
              originalFiles[0]?.path ||
              'repository',
            rationale: structured.root_cause.description,
            operation: 'no_change' as const,
          },
        ];

  const plan: AIAnalysisPlan = {
    summary: structured.task_summary,
    rootCause: `[${structured.root_cause.type}] ${structured.root_cause.description}`,
    rootCauseType: structured.root_cause.type,
    acceptanceCriteria: structured.acceptance_criteria,
    repositoryFindings: structured.repository_findings,
    clarifyingQuestion: structured.clarifying_question ?? null,
    remainingRisks: structured.remaining_risks,
    testsToRun: structured.tests_to_run,
    affectedFiles: structured.files_to_change,
    inspectedFiles:
      inspectedFiles || structured.repository_findings.relevant_files,
    steps,
    riskAssessment:
      structured.remaining_risks.join(' · ') ||
      'Minimal surgical changes preserving public interfaces.',
    testStrategy: `Targeted: ${
      structured.tests_to_run.targeted_tests.join(', ') || 'None'
    } | Full suite: ${structured.tests_to_run.full_suite_command}`,
    providerUsed: providerLabel,
    modelUsed: modelLabel,
    generatedAt: new Date().toISOString(),
  };

  return { plan, changes };
}

/**
 * Builds a deterministic, schema-compliant StructuredAgentOutput for all built-in
 * sample repositories, quick actions, and regression test scenarios.
 */
export function buildDeterministicStructuredOutput(
  repoId: string,
  files: readonly RepoFile[],
  taskDescription: string,
  stage: 'initial' | 'repair_1' = 'initial',
  actionType?: QuickAgentActionType,
  selectionContext?: CodeSelectionContext | null
): StructuredAgentOutput {
  const { findings, toolchain } = analyzeRepositoryStructure(files);
  const lowerTask = taskDescription.toLowerCase();

  // 1. Check Ambiguous Task first
  const ambiguity = detectAmbiguousTask(taskDescription, files, actionType);
  if (ambiguity.isAmbiguous) {
    return {
      task_summary:
        'Task requires clarification before modifying source files.',
      acceptance_criteria: [
        'Clarify target function or module to change',
        'Specify exact expected business rule or threshold values',
      ],
      repository_findings: findings,
      root_cause: {
        type: 'AMBIGUOUS_TASK',
        description:
          'The task request is underspecified and could refer to multiple functions or thresholds. Guessing could introduce unintended regressions.',
        evidence_files: findings.relevant_files.slice(0, 2),
      },
      clarifying_question: ambiguity.clarifyingQuestion,
      files_to_change: [],
      proposed_patch: [],
      tests_to_run: {
        targeted_tests: findings.existing_tests,
        full_suite_command: toolchain.recommendedTestCommand,
      },
      verification_status: 'NEEDS_REVIEW',
      remaining_risks: [
        'Awaiting developer response to clarifying question before generating code changes.',
      ],
    };
  }

  // 2. Check No-Change / Explain / Find-Bug Task
  const noChange = detectNoChangeNeededTask(taskDescription, files, actionType);
  if (noChange.isNoChange) {
    const targetFile =
      selectionContext?.filePath ||
      noChange.evidenceFile ||
      findings.relevant_files[0] ||
      files[0]?.path;
    return {
      task_summary:
        actionType === 'explain-code'
          ? `Architectural & line-by-line explanation of ${targetFile}${
              selectionContext
                ? ` (lines ${selectionContext.startLine}-${selectionContext.endLine})`
                : ''
            }.`
          : actionType === 'find-bug'
          ? `Static bug audit for ${targetFile}: identified boundary & invariant defects with zero code mutations.`
          : 'Verified existing implementation; requested behavior is already present in the repository.',
      acceptance_criteria: [
        `Inspect ${targetFile} and its caller/callee symbol graph`,
        'Verify existing invariants and edge cases',
        'Make zero unnecessary modifications when behavior is already present or read-only analysis is requested',
      ],
      repository_findings: findings,
      root_cause: {
        type: 'NONE_NO_CHANGE_NEEDED',
        description:
          noChange.explanation ||
          'Requested behavior is already implemented in the codebase.',
        evidence_files: targetFile ? [targetFile] : [],
      },
      clarifying_question: null,
      files_to_change: [],
      proposed_patch: [],
      tests_to_run: {
        targeted_tests: findings.existing_tests,
        full_suite_command: toolchain.recommendedTestCommand,
      },
      verification_status: 'NOT_VERIFIED',
      remaining_risks: [
        'No code changes needed; run existing test suite to confirm.',
      ],
    };
  }

  // 3. TypeScript ts-cart-service repository support
  const cartTsFile = files.find((f) => f.path === 'src/cart.ts');
  if (cartTsFile && (repoId === 'ts-cart-service' || lowerTask.includes('cart.ts') || lowerTask.includes('applypromodiscount'))) {
    if (lowerTask.includes('currency') && files.some((f) => f.path === 'src/promo.ts')) {
      const promoFile = files.find((f) => f.path === 'src/promo.ts')!;
      const promoSearch = `export interface CartSummary {\n  subtotalCents: number;\n  discountCents: number;\n  totalCents: number;\n}`;
      const promoReplace = `export interface CartSummary {\n  subtotalCents: number;\n  discountCents: number;\n  totalCents: number;\n  currency?: string;\n}`;
      const patchedPromo = promoFile.content.replace(promoSearch, promoReplace);

      const cartSearch = `  // BUG 1: Matches raw inputCode without normalizeCode(inputCode)\n  const matched = rules.find((r) => r.code === inputCode);\n  if (!matched || matched.percentOff <= 0) return 0;\n\n  // BUG 2: Does not cap percentOff at 100, allowing negative totals\n  const rawDiscount = Math.round((subtotalCents * matched.percentOff) / 100);\n  return rawDiscount;`;
      const cartReplace = `  const normalized = normalizeCode(inputCode);\n  const matched = rules.find((r) => normalizeCode(r.code) === normalized);\n  if (!matched || matched.percentOff <= 0) return 0;\n\n  const cappedPercent = Math.min(100, matched.percentOff);\n  const rawDiscount = Math.round((subtotalCents * cappedPercent) / 100);\n  return Math.min(subtotalCents, rawDiscount);`;
      const summarySearch = `  return {\n    subtotalCents,\n    discountCents,\n    totalCents,\n  };`;
      const summaryReplace = `  return {\n    subtotalCents,\n    discountCents,\n    totalCents,\n    currency: 'USD',\n  };`;
      const patchedCart = cartTsFile.content
        .replace(cartSearch, cartReplace)
        .replace(summarySearch, summaryReplace);

      return {
        task_summary:
          'Add currency field to CartSummary in src/promo.ts and normalize/cap promo discounts in src/cart.ts.',
        acceptance_criteria: [
          'Extend CartSummary interface in src/promo.ts with currency?: string',
          'Normalize coupon code and cap discount at 100% in src/cart.ts',
          'Return currency: "USD" from calculateCartSummary',
        ],
        repository_findings: findings,
        root_cause: {
          type: 'CONFIRMED',
          description:
            'Confirmed in src/promo.ts and src/cart.ts: CartSummary lacks currency and applyPromoDiscount compares unnormalized codes without capping percentOff at 100.',
          evidence_files: ['src/promo.ts', 'src/cart.ts'],
        },
        clarifying_question: null,
        files_to_change: ['src/promo.ts', 'src/cart.ts'],
        proposed_patch: [
          {
            file_path: 'src/promo.ts',
            operation: 'modify',
            explanation: 'Add optional currency field to CartSummary interface.',
            search_replace_blocks: [{ search: promoSearch, replace: promoReplace }],
            patched_content: patchedPromo,
          },
          {
            file_path: 'src/cart.ts',
            operation: 'modify',
            explanation:
              'Normalize coupon code via normalizeCode(), cap discount at subtotalCents, and include currency in summary.',
            search_replace_blocks: [
              { search: cartSearch, replace: cartReplace },
              { search: summarySearch, replace: summaryReplace },
            ],
            patched_content: patchedCart,
          },
        ],
        tests_to_run: {
          targeted_tests: ['tests/cart.test.ts'],
          full_suite_command: 'npx tsx --test tests/cart.test.ts',
        },
        verification_status: 'NOT_VERIFIED',
        remaining_risks: ['None: optional currency property is backwards-compatible.'],
      };
    }

    const searchBlock = `  // BUG 1: Matches raw inputCode without normalizeCode(inputCode)\n  const matched = rules.find((r) => r.code === inputCode);\n  if (!matched || matched.percentOff <= 0) return 0;\n\n  // BUG 2: Does not cap percentOff at 100, allowing negative totals\n  const rawDiscount = Math.round((subtotalCents * matched.percentOff) / 100);\n  return rawDiscount;`;
    const replaceBlock = `  const normalized = normalizeCode(inputCode);\n  const matched = rules.find((r) => normalizeCode(r.code) === normalized);\n  if (!matched || matched.percentOff <= 0) return 0;\n\n  const cappedPercent = Math.min(100, matched.percentOff);\n  const rawDiscount = Math.round((subtotalCents * cappedPercent) / 100);\n  return Math.min(subtotalCents, rawDiscount);`;
    const patchedCart = cartTsFile.content.replace(searchBlock, replaceBlock);

    return {
      task_summary:
        'Normalize promo code with normalizeCode() and cap percentage discount at 100% (subtotalCents) in src/cart.ts.',
      acceptance_criteria: [
        'Call normalizeCode(inputCode) before matching promo rules in applyPromoDiscount',
        'Cap percentOff at 100% so discount never exceeds subtotalCents',
        'Pass tests/cart.test.ts',
      ],
      repository_findings: findings,
      root_cause: {
        type: 'CONFIRMED',
        description:
          'Confirmed in src/cart.ts lines 9-15: `r.code === inputCode` fails on lowercase/whitespace input, and `matched.percentOff` is not capped at 100%.',
        evidence_files: ['src/cart.ts', 'src/promo.ts', 'tests/cart.test.ts'],
      },
      clarifying_question: null,
      files_to_change: ['src/cart.ts'],
      proposed_patch: [
        {
          file_path: 'src/cart.ts',
          operation: 'modify',
          explanation:
            'Use normalizeCode() for case-insensitive matching and cap discount at subtotalCents.',
          search_replace_blocks: [{ search: searchBlock, replace: replaceBlock }],
          patched_content: patchedCart,
        },
      ],
      tests_to_run: {
        targeted_tests: ['tests/cart.test.ts'],
        full_suite_command: 'npx tsx --test tests/cart.test.ts',
      },
      verification_status: 'NOT_VERIFIED',
      remaining_risks: ['None: public function signatures in src/cart.ts are preserved.'],
    };
  }

  // 4. Missing import scenario (metrics-aggregator-py or any file missing math import)
  const statsFile = files.find((f) => f.path === 'metrics/stats.py');
  if (
    statsFile &&
    (repoId === 'metrics-aggregator-py' ||
      lowerTask.includes('math') ||
      lowerTask.includes('import'))
  ) {
    if (lowerTask.includes('sample_count') && lowerTask.includes('reporter.py')) {
      const reporterFile = files.find((f) => f.path === 'metrics/reporter.py');
      const patchedStats = statsFile.content.includes('import math')
        ? statsFile.content
        : `import math\n${statsFile.content}`;
      const patchedReporter = (reporterFile?.content || '').replace(
        '"within_sla": p95 <= sla_limit_ms,',
        '"within_sla": p95 <= sla_limit_ms,\n        "sample_count": len(latencies_ms),'
      );

      return {
        task_summary:
          'Add missing math import in metrics/stats.py and include sample_count in metrics/reporter.py SLA report.',
        acceptance_criteria: [
          'Import math in metrics/stats.py so math.ceil resolves without NameError',
          'Include "sample_count": len(latencies_ms) in build_sla_report return dictionary in metrics/reporter.py',
        ],
        repository_findings: findings,
        root_cause: {
          type: 'CONFIRMED',
          description:
            'metrics/stats.py line 15 calls math.ceil() without importing math, and metrics/reporter.py calls compute_percentile() to build the SLA summary dictionary.',
          evidence_files: ['metrics/stats.py', 'metrics/reporter.py'],
        },
        clarifying_question: null,
        files_to_change: ['metrics/stats.py', 'metrics/reporter.py'],
        proposed_patch: [
          {
            file_path: 'metrics/stats.py',
            operation: 'modify',
            explanation: 'Add missing `import math` at top of metrics/stats.py.',
            search_replace_blocks: [
              {
                search: 'from typing import Sequence',
                replace: 'import math\nfrom typing import Sequence',
              },
            ],
            patched_content: patchedStats,
          },
          {
            file_path: 'metrics/reporter.py',
            operation: 'modify',
            explanation: 'Add `sample_count` key to build_sla_report output dictionary.',
            search_replace_blocks: [
              {
                search: '"within_sla": p95 <= sla_limit_ms,',
                replace:
                  '"within_sla": p95 <= sla_limit_ms,\n        "sample_count": len(latencies_ms),',
              },
            ],
            patched_content: patchedReporter,
          },
        ],
        tests_to_run: {
          targeted_tests: [
            'tests/test_stats.py::test_compute_p95_nearest_rank',
            'tests/test_stats.py::test_build_sla_report_within_limit',
          ],
          full_suite_command: 'pytest -q',
        },
        verification_status: 'NOT_VERIFIED',
        remaining_risks: [
          'Verify downstream callers of build_sla_report tolerate the additional dictionary key.',
        ],
      };
    }

    const patchedStats = statsFile.content.includes('import math')
      ? statsFile.content
      : statsFile.content.replace(
          'from typing import Sequence',
          'import math\nfrom typing import Sequence'
        );

    return {
      task_summary:
        'Add missing `import math` in metrics/stats.py to resolve NameError in compute_percentile.',
      acceptance_criteria: [
        'Import math module in metrics/stats.py',
        'Ensure compute_percentile and caller build_sla_report execute without NameError',
      ],
      repository_findings: findings,
      root_cause: {
        type: 'CONFIRMED',
        description:
          'Confirmed in metrics/stats.py line 15: `math.ceil((percentile / 100.0) * len(ordered))` is called, but `math` is never imported in metrics/stats.py.',
        evidence_files: ['metrics/stats.py', 'metrics/reporter.py'],
      },
      clarifying_question: null,
      files_to_change: ['metrics/stats.py'],
      proposed_patch: [
        {
          file_path: 'metrics/stats.py',
          operation: 'modify',
          explanation: 'Import `math` at top of `metrics/stats.py`.',
          search_replace_blocks: [
            {
              search: 'from typing import Sequence',
              replace: 'import math\nfrom typing import Sequence',
            },
          ],
          patched_content: patchedStats,
        },
      ],
      tests_to_run: {
        targeted_tests: [
          'tests/test_stats.py::test_compute_p95_nearest_rank',
          'tests/test_stats.py::test_build_sla_report_within_limit',
        ],
        full_suite_command: 'pytest -q',
      },
      verification_status: 'NOT_VERIFIED',
      remaining_risks: ['Low risk: standard library import addition only.'],
    };
  }

  // 5. Multi-file task on billing-engine-py (adding currency across billing/models.py and billing/calculator.py)
  if (
    lowerTask.includes('currency') &&
    files.some((f) => f.path === 'billing/models.py') &&
    files.some((f) => f.path === 'billing/calculator.py')
  ) {
    const modelsFile = files.find((f) => f.path === 'billing/models.py')!;
    const calcFile = files.find((f) => f.path === 'billing/calculator.py')!;

    const modelsSearch = `class LineItem:\n    sku: str\n    unit_price: float\n    quantity: int`;
    const modelsReplace = `class LineItem:\n    sku: str\n    unit_price: float\n    quantity: int\n    currency: str = "USD"`;

    const summarySearch = `class InvoiceSummary:\n    subtotal: float\n    discount_amount: float\n    tax_amount: float\n    total: float\n    applied_rate: float`;
    const summaryReplace = `class InvoiceSummary:\n    subtotal: float\n    discount_amount: float\n    tax_amount: float\n    total: float\n    applied_rate: float\n    currency: str = "USD"`;

    const patchedModels = modelsFile.content
      .replace(modelsSearch, modelsReplace)
      .replace(summarySearch, summaryReplace);

    const calcSearch = `    if total_quantity > 50:\n        rate = 0.15\n    elif total_quantity > 10:\n        rate = 0.10`;
    const calcReplace = `    if total_quantity >= 50:\n        rate = 0.15\n    elif total_quantity >= 10:\n        rate = 0.10`;
    const taxSearch = `    # BUG 2: Tax is erroneously computed on gross subtotal instead of discounted_subtotal\n    tax_amount = round(subtotal * tax_rate, 2)`;
    const taxReplace = `    tax_amount = round(discounted_subtotal * tax_rate, 2)`;
    const returnSearch = `    return InvoiceSummary(\n        subtotal=subtotal,\n        discount_amount=discount_amount,\n        tax_amount=tax_amount,\n        total=total,\n        applied_rate=applied_rate,\n    )`;
    const returnReplace = `    currency = item_list[0].currency if item_list else "USD"\n    return InvoiceSummary(\n        subtotal=subtotal,\n        discount_amount=discount_amount,\n        tax_amount=tax_amount,\n        total=total,\n        applied_rate=applied_rate,\n        currency=currency,\n    )`;

    const patchedCalc = calcFile.content
      .replace(calcSearch, calcReplace)
      .replace(taxSearch, taxReplace)
      .replace(returnSearch, returnReplace);

    return {
      task_summary:
        'Add default currency field ("USD") to LineItem and InvoiceSummary in billing/models.py and propagate currency in calculate_invoice_total in billing/calculator.py.',
      acceptance_criteria: [
        'Add currency: str = "USD" to LineItem and InvoiceSummary dataclasses in billing/models.py',
        'Propagate currency from input LineItem list to InvoiceSummary in billing/calculator.py',
        'Preserve backwards compatibility for callers omitting currency',
      ],
      repository_findings: findings,
      root_cause: {
        type: 'CONFIRMED',
        description:
          'Confirmed across billing/models.py and its caller billing/calculator.py: dataclass definitions lack a currency attribute and calculate_invoice_total constructs InvoiceSummary without currency.',
        evidence_files: ['billing/models.py', 'billing/calculator.py'],
      },
      clarifying_question: null,
      files_to_change: ['billing/models.py', 'billing/calculator.py'],
      proposed_patch: [
        {
          file_path: 'billing/models.py',
          operation: 'modify',
          explanation:
            'Add `currency: str = "USD"` with default value to LineItem and InvoiceSummary.',
          search_replace_blocks: [
            { search: modelsSearch, replace: modelsReplace },
            { search: summarySearch, replace: summaryReplace },
          ],
          patched_content: patchedModels,
        },
        {
          file_path: 'billing/calculator.py',
          operation: 'modify',
          explanation:
            'Pass resolved currency into InvoiceSummary constructor and fix tier/tax calculation.',
          search_replace_blocks: [
            { search: calcSearch, replace: calcReplace },
            { search: taxSearch, replace: taxReplace },
            { search: returnSearch, replace: returnReplace },
          ],
          patched_content: patchedCalc,
        },
      ],
      tests_to_run: {
        targeted_tests: [
          'tests/test_calculator.py::test_no_discount_under_ten_units',
          'tests/test_calculator.py::test_tax_computed_on_discounted_subtotal',
        ],
        full_suite_command: 'pytest -q',
      },
      verification_status: 'NOT_VERIFIED',
      remaining_risks: [
        'Mixed-currency line items currently default to the first item currency.',
      ],
    };
  }

  // 6. rate-limiter-py bug fix
  if (repoId === 'rate-limiter-py' || files.some((f) => f.path === 'limiter/bucket.py')) {
    const target = files.find((f) => f.path === 'limiter/bucket.py');
    const originalContent = target?.content || '';
    const search1 = `        # BUG 1: Floor division // discards fractional elapsed refills\n        added = (elapsed * self.refill_rate) // 1\n        self.tokens = min(self.capacity, self.tokens + added)`;
    const replace1 = `        added = elapsed * self.refill_rate\n        self.tokens = min(self.capacity, round(self.tokens + added, 6))`;
    const search2 = `    def consume(self, requested: float, now: float) -> bool:\n        # BUG 2: Missing validation for requested <= 0\n        self._refill(now)`;
    const replace2 = `    def consume(self, requested: float, now: float) -> bool:\n        if requested <= 0:\n            raise ValueError("requested tokens must be strictly positive")\n        self._refill(now)`;

    const patchedContent = originalContent
      .replace(search1, replace1)
      .replace(search2, replace2);

    return {
      task_summary:
        'Restore floating-point token accumulation in TokenBucket._refill and enforce positive token validation in TokenBucket.consume.',
      acceptance_criteria: [
        'Replace floor division `// 1` with floating-point multiplication in `TokenBucket._refill`',
        'Raise `ValueError` in `TokenBucket.consume` when `requested <= 0`',
        'Pass `test_fractional_second_refill` and `test_zero_or_negative_consume_raises`',
      ],
      repository_findings: findings,
      root_cause: {
        type: 'CONFIRMED',
        description:
          'Confirmed in limiter/bucket.py line 19 (`added = (elapsed * self.refill_rate) // 1` truncates fractional refills) and line 23 (`consume` lacks a `requested <= 0` guard).',
        evidence_files: ['limiter/bucket.py', 'tests/test_bucket.py'],
      },
      clarifying_question: null,
      files_to_change: ['limiter/bucket.py'],
      proposed_patch: [
        {
          file_path: 'limiter/bucket.py',
          operation: 'modify',
          explanation:
            'Use float multiplication in `_refill()` and raise `ValueError` when `requested <= 0` in `consume()`.',
          search_replace_blocks: [
            { search: search1, replace: replace1 },
            { search: search2, replace: replace2 },
          ],
          patched_content: patchedContent,
        },
      ],
      tests_to_run: {
        targeted_tests: [
          'tests/test_bucket.py::test_fractional_second_refill',
          'tests/test_bucket.py::test_zero_or_negative_consume_raises',
        ],
        full_suite_command: 'pytest -q',
      },
      verification_status: 'NOT_VERIFIED',
      remaining_risks: [
        'Floating-point rounding is bounded to 6 decimal places via round(..., 6).',
      ],
    };
  }

  // 7. Quick action: generate-tests on billing-engine-py
  if (actionType === 'generate-tests' && files.some((f) => f.path === 'tests/test_calculator.py')) {
    const testFile = files.find((f) => f.path === 'tests/test_calculator.py')!;
    const searchEnd = `def test_negative_tax_rate_raises():\n    items = [LineItem(sku="PRO-NODE", unit_price=25.0, quantity=2)]\n    with pytest.raises(ValueError):\n        calculate_invoice_total(items, tax_rate=-0.05)`;
    const replaceEnd = `${searchEnd}\n\n\ndef test_empty_invoice_returns_zero_totals():\n    summary = calculate_invoice_total([], tax_rate=0.08)\n    assert summary.subtotal == 0.0\n    assert summary.discount_amount == 0.0\n    assert summary.tax_amount == 0.0\n    assert summary.total == 0.0`;
    const patchedTests = testFile.content.replace(searchEnd, replaceEnd);

    return {
      task_summary:
        'Add unit test coverage for empty invoice line items in tests/test_calculator.py.',
      acceptance_criteria: [
        'Add test_empty_invoice_returns_zero_totals to tests/test_calculator.py',
        'Verify zero subtotal, discount, tax, and total invariants',
      ],
      repository_findings: findings,
      root_cause: {
        type: 'CONFIRMED',
        description:
          'Inspected tests/test_calculator.py and billing/calculator.py: empty line item list behavior is handled in code but lacked a dedicated regression test.',
        evidence_files: ['tests/test_calculator.py', 'billing/calculator.py'],
      },
      clarifying_question: null,
      files_to_change: ['tests/test_calculator.py'],
      proposed_patch: [
        {
          file_path: 'tests/test_calculator.py',
          operation: 'modify',
          explanation: 'Append test_empty_invoice_returns_zero_totals test case.',
          search_replace_blocks: [{ search: searchEnd, replace: replaceEnd }],
          patched_content: patchedTests,
        },
      ],
      tests_to_run: {
        targeted_tests: ['tests/test_calculator.py::test_empty_invoice_returns_zero_totals'],
        full_suite_command: 'pytest -q',
      },
      verification_status: 'NOT_VERIFIED',
      remaining_risks: ['None: additive test change only.'],
    };
  }

  // 8. Default: billing-engine-py (supports both single-pass fix and 1-retry repair loop demo)
  const calcFile = files.find((f) => f.path === 'billing/calculator.py');
  if (calcFile) {
    const originalContent = calcFile.content;
    const triggerTwoStepDemo =
      lowerTask.includes('triggers 1-retry') || lowerTask.includes('boundary first');
    const usePartial = stage === 'initial' && triggerTwoStepDemo;

    const tierSearch = `    # BUG 1: Off-by-one strict inequality misses exact tier boundaries 50 and 10\n    if total_quantity > 50:\n        rate = 0.15\n    elif total_quantity > 10:\n        rate = 0.10`;
    const tierReplace = `    if total_quantity >= 50:\n        rate = 0.15\n    elif total_quantity >= 10:\n        rate = 0.10`;

    const taxSearch = `    # BUG 2: Tax is erroneously computed on gross subtotal instead of discounted_subtotal\n    tax_amount = round(subtotal * tax_rate, 2)`;
    const taxReplace = `    tax_amount = round(discounted_subtotal * tax_rate, 2)`;

    const partialContent = originalContent.replace(tierSearch, tierReplace);
    const fullFixedContent = originalContent
      .replace(tierSearch, tierReplace)
      .replace(taxSearch, taxReplace);

    return {
      task_summary: usePartial
        ? 'Update bulk discount tier thresholds in calculate_tier_discount to use inclusive >= comparisons.'
        : 'Fix inclusive quantity tier thresholds (>= 50 and >= 10) in calculate_tier_discount and compute sales tax on discounted_subtotal in calculate_invoice_total.',
      acceptance_criteria: [
        'Orders of exactly 10 units receive the 10% tier discount rate (0.10)',
        'Orders of exactly 50 units receive the 15% tier discount rate (0.15)',
        'Sales tax in calculate_invoice_total is computed on discounted_subtotal rather than gross subtotal',
      ],
      repository_findings: findings,
      root_cause: {
        type: 'CONFIRMED',
        description:
          'Confirmed in billing/calculator.py lines 16-19 (`total_quantity > 50` and `total_quantity > 10` exclude exact boundary quantities) and line 42 (`round(subtotal * tax_rate, 2)` applies tax before subtracting discount).',
        evidence_files: ['billing/calculator.py', 'tests/test_calculator.py'],
      },
      clarifying_question: null,
      files_to_change: ['billing/calculator.py'],
      proposed_patch: [
        {
          file_path: 'billing/calculator.py',
          operation: 'modify',
          explanation: usePartial
            ? 'Minimal change: replace `>` with `>=` on lines 16 and 18 of `billing/calculator.py`.'
            : 'Minimal surgical change: replace `>` with `>=` in `calculate_tier_discount` and compute `tax_amount` from `discounted_subtotal` in `calculate_invoice_total`.',
          search_replace_blocks: usePartial
            ? [{ search: tierSearch, replace: tierReplace }]
            : originalContent.includes(tierSearch)
            ? [
                { search: tierSearch, replace: tierReplace },
                { search: taxSearch, replace: taxReplace },
              ]
            : [{ search: taxSearch, replace: taxReplace }],
          patched_content: usePartial ? partialContent : fullFixedContent,
        },
      ],
      tests_to_run: {
        targeted_tests: [
          'tests/test_calculator.py::test_exact_ten_units_tier_boundary',
          'tests/test_calculator.py::test_exact_fifty_units_tier_boundary',
          'tests/test_calculator.py::test_tax_computed_on_discounted_subtotal',
        ],
        full_suite_command: 'pytest -q',
      },
      verification_status: 'NOT_VERIFIED',
      remaining_risks: [
        'None: dataclass schemas and function signatures in billing/calculator.py are preserved.',
      ],
    };
  }

  // Generic fallback for custom uploaded multi-language repositories
  const targetFile =
    selectionContext?.filePath ||
    findings.relevant_files[0] ||
    files[0]?.path ||
    'README.md';
  return {
    task_summary: `Inspected ${targetFile} (${findings.language}) and analyzed task requirements.`,
    acceptance_criteria: [
      `Inspect ${targetFile} and project manifest (${
        toolchain.manifestFiles.join(', ') || 'none'
      })`,
      'Preserve existing interfaces and code formatting',
    ],
    repository_findings: findings,
    root_cause: {
      type: 'HYPOTHESIS',
      description: `Analyzed ${targetFile} in ${findings.language} repository using static analyzer.`,
      evidence_files: [targetFile],
    },
    clarifying_question: null,
    files_to_change: [],
    proposed_patch: [],
    tests_to_run: {
      targeted_tests: findings.existing_tests,
      full_suite_command: toolchain.recommendedTestCommand,
    },
    verification_status: 'NOT_VERIFIED',
    remaining_risks: [
      toolchain.unavailableReason ||
        'Run verification suite to confirm behavior.',
    ],
  };
}

export function buildDeterministicAnalysisAndPatch(
  repoId: string,
  files: RepoFile[],
  taskDescription: string,
  providerLabel: string,
  modelLabel: string,
  stage: 'initial' | 'repair_1' = 'initial'
): {
  structuredOutput: StructuredAgentOutput;
  plan: AIAnalysisPlan;
  changes: FilePatchChange[];
  repairNotes?: string;
} {
  const structuredOutput = buildDeterministicStructuredOutput(
    repoId,
    files,
    taskDescription,
    stage
  );
  const { plan, changes } = convertStructuredOutputToLegacyPlanAndChanges(
    structuredOutput,
    files,
    providerLabel,
    modelLabel
  );

  return {
    structuredOutput,
    plan,
    changes,
    repairNotes:
      stage === 'repair_1'
        ? 'Analyzed targeted pytest failure in `test_tax_computed_on_discounted_subtotal` (`AssertionError: assert 50.0 == 45.0`). Applied minimal search/replace fix changing `round(subtotal * tax_rate, 2)` to `round(discounted_subtotal * tax_rate, 2)` in `billing/calculator.py`.'
        : undefined,
  };
}
