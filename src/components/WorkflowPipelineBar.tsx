import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  XCircle,
} from 'lucide-react';
import type {
  AgentTaskLifecycleState,
  ProposedPatchBundle,
  SandboxRunResponse,
  TestVerificationOutcome,
  VerificationStatus,
} from '../types/repopilot';

interface WorkflowPipelineBarProps {
  activeRepoId: string;
  filesCount: number;
  patchBundle: ProposedPatchBundle | null;
  sandboxRunResult: SandboxRunResponse | null;
  isAnalyzing?: boolean;
  isRunningSandbox?: boolean;
}

interface StageItem {
  id: string;
  code: string;
  label: string;
  state: 'complete' | 'active' | 'warning' | 'error' | 'pending';
  detail: string;
}

export const WorkflowPipelineBar: React.FC<WorkflowPipelineBarProps> = ({
  activeRepoId,
  filesCount,
  patchBundle,
  sandboxRunResult,
  isAnalyzing = false,
  isRunningSandbox = false,
}) => {
  const effectiveVerificationStatus: VerificationStatus =
    sandboxRunResult?.verificationStatus ||
    patchBundle?.verificationStatus ||
    'NOT_VERIFIED';

  const effectiveTestOutcome: TestVerificationOutcome =
    sandboxRunResult?.testOutcome ||
    patchBundle?.testOutcome ||
    'NOT_VERIFIED';

  const hasPlan = Boolean(patchBundle);
  const needsClarification = Boolean(patchBundle?.needsClarification);
  const isNoChange = Boolean(patchBundle?.isNoChangeTask);
  const hasPatch = Boolean(patchBundle && patchBundle.changes.length > 0);
  const patchValid = Boolean(patchBundle?.patchValidationPassed);
  const hasSandboxRun = Boolean(sandboxRunResult);
  const retryCount = sandboxRunResult?.retryCount ?? 0;

  let currentLifecycleState: AgentTaskLifecycleState = 'INSPECTING';
  if (isAnalyzing) {
    currentLifecycleState = 'PLANNING';
  } else if (isRunningSandbox) {
    currentLifecycleState = 'RUNNING_TESTS';
  } else if (sandboxRunResult) {
    currentLifecycleState = sandboxRunResult.lifecycleState;
  } else if (patchBundle?.lifecycleState) {
    currentLifecycleState = patchBundle.lifecycleState;
  }

  const stages: StageItem[] = [
    {
      id: 'repo_inspection',
      code: 'INSPECTING',
      label: '1. Inspecting',
      state: filesCount > 0 ? 'complete' : 'pending',
      detail: `${filesCount} files indexed`,
    },
    {
      id: 'task_planning',
      code: 'PLANNING',
      label: '2. Planning',
      state: isAnalyzing
        ? 'active'
        : !hasPlan
        ? 'active'
        : needsClarification
        ? 'warning'
        : 'complete',
      detail: isAnalyzing
        ? 'Analyzing...'
        : !hasPlan
        ? 'Awaiting task'
        : needsClarification
        ? 'Clarification needed'
        : `${patchBundle?.plan.acceptanceCriteria?.length || 0} criteria`,
    },
    {
      id: 'patch_generation',
      code: 'EDITING',
      label: '3. Editing',
      state: !hasPlan
        ? 'pending'
        : needsClarification
        ? 'warning'
        : isNoChange
        ? 'complete'
        : hasPatch
        ? 'complete'
        : 'pending',
      detail: isNoChange
        ? '0 changes needed'
        : hasPatch
        ? `${patchBundle?.changes.length} file(s)`
        : 'Pending',
    },
    {
      id: 'patch_validation',
      code: 'VALIDATING PATCH',
      label: '4. Validating Patch',
      state:
        !hasPlan || needsClarification
          ? 'pending'
          : patchValid
          ? 'complete'
          : 'error',
      detail: !hasPlan
        ? 'Pending'
        : patchValid
        ? 'Clean & syntax OK'
        : 'Validation error',
    },
    {
      id: 'test_execution',
      code: 'RUNNING TESTS',
      label: '5. Running Tests',
      state: isRunningSandbox
        ? 'active'
        : !hasSandboxRun
        ? hasPlan && patchBundle?.approvalStatus === 'approved_staged'
          ? 'active'
          : 'pending'
        : effectiveTestOutcome === 'TESTS_PASSED'
        ? 'complete'
        : effectiveTestOutcome === 'PARTIALLY_VERIFIED' ||
          effectiveTestOutcome === 'NOT_VERIFIED'
        ? 'warning'
        : 'error',
      detail: isRunningSandbox
        ? 'Running suite...'
        : !hasSandboxRun
        ? 'Not run yet'
        : effectiveTestOutcome.replace('_', ' '),
    },
    {
      id: 'repair_attempts',
      code: 'REPAIRING',
      label: '6. Repairing',
      state: !hasSandboxRun
        ? 'pending'
        : retryCount > 0
        ? effectiveVerificationStatus === 'VERIFIED'
          ? 'complete'
          : 'error'
        : 'complete',
      detail: !hasSandboxRun
        ? '0 / 2 used'
        : `${retryCount} / ${sandboxRunResult?.maxRetries ?? 2} retries`,
    },
    {
      id: 'final_report',
      code: effectiveVerificationStatus,
      label: '7. Final Status',
      state:
        effectiveVerificationStatus === 'VERIFIED'
          ? 'complete'
          : effectiveVerificationStatus === 'FAILED'
          ? 'error'
          : effectiveVerificationStatus === 'PARTIALLY_VERIFIED' ||
            effectiveVerificationStatus === 'NEEDS_REVIEW'
          ? 'warning'
          : 'pending',
      detail: effectiveVerificationStatus.replace('_', ' '),
    },
  ];

  const statusConfig: Record<
    VerificationStatus,
    { label: string; colorClass: string; Icon: React.ElementType }
  > = {
    VERIFIED: {
      label: 'VERIFIED',
      colorClass: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/30',
      Icon: CheckCircle2,
    },
    PARTIALLY_VERIFIED: {
      label: 'PARTIALLY VERIFIED',
      colorClass: 'text-amber-300 border-amber-500/40 bg-amber-950/30',
      Icon: AlertTriangle,
    },
    FAILED: {
      label: 'FAILED',
      colorClass: 'text-rose-400 border-rose-500/40 bg-rose-950/30',
      Icon: XCircle,
    },
    NOT_VERIFIED: {
      label: 'NOT VERIFIED',
      colorClass: 'text-slate-300 border-slate-700 bg-slate-800/60',
      Icon: Clock,
    },
    NEEDS_REVIEW: {
      label: 'NEEDS REVIEW',
      colorClass: 'text-amber-300 border-amber-500/40 bg-amber-950/30',
      Icon: HelpCircle,
    },
  };

  const activeBadge = statusConfig[effectiveVerificationStatus];
  const StatusIcon = activeBadge.Icon;

  return (
    <section
      aria-label="Agent Workflow Sequence"
      className="shrink-0 border-b border-slate-800/90 bg-[#0E131F] px-4 py-2.5 flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="font-semibold text-slate-100">{activeRepoId}</span>
          <span className="text-slate-600">·</span>
          <span className="text-sky-400 font-semibold">
            State: {currentLifecycleState.replace('_', ' ')}
          </span>
          <span className="text-slate-600 hidden sm:inline">·</span>
          <span className="text-slate-400 hidden sm:inline">
            INSPECTING → PLANNING → EDITING → VALIDATING PATCH → RUNNING TESTS → REPAIRING → {effectiveVerificationStatus.replace('_', ' ')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden md:inline-block px-2.5 py-0.5 rounded border border-slate-700 bg-[#0B0F17] text-[11px] font-mono text-slate-300">
            Outcome: {effectiveTestOutcome.replace('_', ' ')}
          </span>
          <div
            data-testid="verification-status-indicator"
            className={`px-2.5 py-0.5 rounded border text-xs font-mono font-semibold flex items-center gap-1.5 ${activeBadge.colorClass}`}
          >
            <StatusIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Status: {activeBadge.label}</span>
          </div>
        </div>
      </div>

      {/* 7-Step Compact Sequence Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
        {stages.map((stage) => {
          const borderClass =
            stage.state === 'complete'
              ? 'border-emerald-500/30 bg-emerald-950/15 text-emerald-200'
              : stage.state === 'active'
              ? 'border-sky-500/40 bg-sky-950/20 text-sky-200'
              : stage.state === 'warning'
              ? 'border-amber-500/40 bg-amber-950/20 text-amber-200'
              : stage.state === 'error'
              ? 'border-rose-500/40 bg-rose-950/20 text-rose-200'
              : 'border-slate-800 bg-[#0B0F17] text-slate-400';

          return (
            <div
              key={stage.id}
              className={`rounded border px-2 py-1 flex flex-col ${borderClass}`}
            >
              <span className="text-[11px] font-semibold truncate">
                {stage.label}
              </span>
              <span className="text-[10px] font-mono tabular-nums opacity-85 truncate">
                {stage.detail}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
};
