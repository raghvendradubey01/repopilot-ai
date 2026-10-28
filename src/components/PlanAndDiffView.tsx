import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileArchive,
  FileCode2,
  GitCompare,
  HelpCircle,
  RotateCcw,
  Terminal,
  XCircle,
} from 'lucide-react';
import type { ProposedPatchBundle } from '../types/repopilot';

interface PlanAndDiffViewProps {
  patchBundle: ProposedPatchBundle | null;
  onApprovePatch: () => void;
  onRevertApproval: () => void;
  onRejectPatch?: () => void;
  onSelectFile?: (path: string) => void;
  onDownloadPatchFile: () => void;
  onDownloadPatchedZip: () => void;
  onProceedToSandbox: () => void;
  onGenerateInitialPlan: () => void;
  onSubmitClarification?: (clarificationText: string) => void;
  isAnalyzing: boolean;
}

export const PlanAndDiffView: React.FC<PlanAndDiffViewProps> = ({
  patchBundle,
  onApprovePatch,
  onRevertApproval,
  onRejectPatch,
  onSelectFile,
  onDownloadPatchFile,
  onDownloadPatchedZip,
  onProceedToSandbox,
  onGenerateInitialPlan,
  onSubmitClarification,
  isAnalyzing,
}) => {
  const [diffMode, setDiffMode] = useState<'split' | 'unified'>('split');
  const [clarificationAnswer, setClarificationAnswer] = useState<string>('');

  if (!patchBundle) {
    return (
      <div className="rounded-lg border border-slate-800 bg-[#0E131F] p-10 text-center flex flex-col items-center gap-4">
        <GitCompare className="w-8 h-8 text-sky-400" />
        <div className="max-w-lg flex flex-col gap-1.5">
          <h3 className="text-base font-semibold text-slate-100">
            No Proposed Plan or Code Patch Yet
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Describe the bug or feature in the AI Composer or left panel and run the AI Agent to generate a structured engineering plan, explicit acceptance criteria, root cause diagnosis, and validated patch diff.
          </p>
        </div>
        <button
          type="button"
          onClick={onGenerateInitialPlan}
          disabled={isAnalyzing}
          className="px-4 py-2 rounded-lg bg-sky-500 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          {isAnalyzing ? 'Generating Plan & Patch...' : 'Analyze Current Task Now'}
        </button>
      </div>
    );
  }

  const { plan, diffs, approvalStatus, structuredOutput } = patchBundle;
  const isApproved = approvalStatus === 'approved_staged';
  const isRejected = approvalStatus === 'rejected';
  const rootCauseType =
    structuredOutput?.root_cause.type || plan.rootCauseType || 'CONFIRMED';

  return (
    <div className="flex flex-col gap-5">
      {/* Ambiguous Task Clarifying Question Banner */}
      {patchBundle.needsClarification && patchBundle.clarifyingQuestion && (
        <section
          role="region"
          aria-label="Clarifying Question Required"
          className="rounded-lg border border-amber-500/40 bg-amber-950/25 p-5 flex flex-col gap-3"
        >
          <div className="flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-amber-100">
                Clarification Needed Before Modifying Code (Status: NEEDS REVIEW)
              </h3>
              <p className="text-xs text-amber-200 leading-relaxed">
                {patchBundle.clarifyingQuestion}
              </p>
            </div>
          </div>

          {onSubmitClarification && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <input
                type="text"
                aria-label="Clarification Response"
                value={clarificationAnswer}
                onChange={(e) => setClarificationAnswer(e.target.value)}
                placeholder="Enter clarification (e.g., Use inclusive >= 10 and >= 50 thresholds in billing/calculator.py)..."
                className="flex-1 rounded-lg border border-amber-500/40 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                disabled={!clarificationAnswer.trim() || isAnalyzing}
                onClick={() => {
                  onSubmitClarification(clarificationAnswer.trim());
                  setClarificationAnswer('');
                }}
                className="px-4 py-2 rounded-lg bg-amber-400 text-xs font-semibold text-slate-950 hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                Submit Clarification &amp; Re-Analyze
              </button>
            </div>
          )}
        </section>
      )}

      {/* No-Change Task Notice */}
      {patchBundle.isNoChangeTask && (
        <section className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs text-emerald-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <strong className="text-emerald-100">
                No Code Changes Required:
              </strong>{' '}
              {structuredOutput?.root_cause.description ||
                'Requested behavior is already implemented in the repository.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onProceedToSandbox}
            className="px-3.5 py-1.5 rounded-lg bg-sky-500 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Verify Existing Suite in Sandbox
          </button>
        </section>
      )}

      {/* Top Action & Approval Gate Bar */}
      {!patchBundle.needsClarification && !patchBundle.isNoChangeTask && (
        <div className="rounded-lg border border-slate-800 bg-[#0E131F] p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-100">
                Review &amp; Patch Validation Gate:
              </span>
              <span
                className={`font-mono ${
                  isApproved
                    ? 'text-emerald-400'
                    : isRejected
                    ? 'text-rose-400'
                    : 'text-amber-300'
                }`}
              >
                {isApproved
                  ? 'Approved & Staged in Clone (Original Repo Untouched)'
                  : isRejected
                  ? 'Rejected / Reverted to Original'
                  : 'Pending Developer Review & Approval'}
              </span>
              <span className="text-slate-600">·</span>
              <span
                className={`font-mono ${
                  patchBundle.patchValidationPassed
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                Patch Validation:{' '}
                {patchBundle.patchValidationPassed ? 'PASSED' : 'FAILED'}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400 font-mono tabular-nums">
                Verification: {patchBundle.verificationStatus}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Minimal surgical diff validated against real repository files and static syntax/import rules.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!isApproved ? (
              <>
                <button
                  type="button"
                  onClick={onApprovePatch}
                  disabled={!patchBundle.patchValidationPassed}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approve &amp; Stage Patch</span>
                </button>
                {onRejectPatch && !isRejected && (
                  <button
                    type="button"
                    onClick={onRejectPatch}
                    className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-900/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Reject Patch</span>
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onProceedToSandbox}
                  className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Open Sandbox Test Runner</span>
                </button>
                <button
                  type="button"
                  onClick={onRevertApproval}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Unstage / Revert Patch</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onDownloadPatchFile}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Download .patch</span>
            </button>

            <button
              type="button"
              onClick={onDownloadPatchedZip}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileArchive className="w-3.5 h-3.5 text-emerald-400" />
              <span>Download Patched .zip</span>
            </button>
          </div>
        </div>
      )}

      {/* Section 1: AI Structured Engineering Plan & Acceptance Criteria */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131F] p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <h3 className="text-sm font-semibold text-slate-100">
            01. AI Agent Engineering Plan &amp; Root Cause Analysis
          </h3>
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            <span>Provider: {plan.providerUsed}</span>
            <span className="mx-2 text-slate-600">·</span>
            <span>Model: {plan.modelUsed}</span>
          </div>
        </div>

        {/* Inspected vs Modified Files Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-300">
              Files Inspected by Agent ({plan.inspectedFiles?.length || 0})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(plan.inspectedFiles || plan.affectedFiles).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onSelectFile?.(f)}
                  className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 font-mono text-[11px] text-slate-200 hover:border-sky-400 cursor-pointer flex items-center gap-1"
                >
                  <FileCode2 className="w-3 h-3 text-sky-400" />
                  <span>{f}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-300">
              Files Modified in Proposed Patch ({patchBundle.changes.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {patchBundle.changes.length === 0 ? (
                <span className="text-[11px] font-mono text-slate-500">
                  0 files modified
                </span>
              ) : (
                patchBundle.changes.map((c) => (
                  <button
                    key={c.filePath}
                    type="button"
                    onClick={() => onSelectFile?.(c.filePath)}
                    className="px-2 py-0.5 rounded bg-emerald-950/30 border border-emerald-500/40 font-mono text-[11px] text-emerald-200 hover:border-emerald-400 cursor-pointer flex items-center gap-1"
                  >
                    <FileCode2 className="w-3 h-3 text-emerald-400" />
                    <span>{c.filePath}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="rounded-lg border border-slate-800/90 bg-[#0B0F17] p-4 flex flex-col gap-2">
            <span className="font-semibold text-slate-200">
              Task Summary &amp; Explicit Acceptance Criteria
            </span>
            <p className="text-slate-300 leading-relaxed">{plan.summary}</p>
            {plan.acceptanceCriteria && plan.acceptanceCriteria.length > 0 && (
              <ul className="list-disc list-inside text-slate-300 flex flex-col gap-1 pt-1 border-t border-slate-800/80">
                {plan.acceptanceCriteria.map((ac, i) => (
                  <li key={i} className="leading-snug">
                    {ac}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-slate-800/90 bg-[#0B0F17] p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-200">
                Root Cause Diagnosis
              </span>
              <span
                className={`font-mono text-[11px] font-semibold ${
                  rootCauseType === 'CONFIRMED'
                    ? 'text-emerald-400'
                    : rootCauseType === 'AMBIGUOUS_TASK'
                    ? 'text-amber-300'
                    : 'text-sky-300'
                }`}
              >
                Classification: {rootCauseType}
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed font-mono text-[11px]">
              {structuredOutput?.root_cause.description || plan.rootCause}
            </p>
            {structuredOutput?.root_cause.evidence_files &&
              structuredOutput.root_cause.evidence_files.length > 0 && (
                <div className="text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/80">
                  Evidence Files:{' '}
                  {structuredOutput.root_cause.evidence_files.join(', ')}
                </div>
              )}
          </div>
        </div>

        {/* Step-by-Step Plan Table */}
        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0B0F17] text-slate-400">
                <th className="py-2.5 px-3 font-medium w-16">Step</th>
                <th className="py-2.5 px-3 font-medium">Action</th>
                <th className="py-2.5 px-3 font-medium">Target File</th>
                <th className="py-2.5 px-3 font-medium">
                  Engineering Rationale
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {plan.steps.map((step) => (
                <tr key={step.stepNumber} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-3 font-mono tabular-nums text-sky-400">
                    0{step.stepNumber}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-100">
                    {step.title}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">
                    {step.targetFile}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    {step.rationale}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs text-slate-400">
          <div>
            <strong className="text-slate-200">Remaining Risks:</strong>{' '}
            {plan.riskAssessment}
          </div>
          <div>
            <strong className="text-slate-200">
              Targeted &amp; Full Test Plan:
            </strong>{' '}
            {plan.testStrategy}
          </div>
        </div>
      </section>

      {/* Section 2: Before/After Code Diff Viewer */}
      {diffs.length > 0 && (
        <section className="rounded-lg border border-slate-800 bg-[#0E131F] flex flex-col overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-slate-100">
                02. Proposed Code Patch &amp; Before/After Diff
              </h3>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                {diffs.length} file(s) changed
              </span>
            </div>

            <div
              role="group"
              aria-label="Diff View Mode"
              className="flex items-center gap-1 rounded-lg bg-[#0B0F17] p-1 border border-slate-800"
            >
              <button
                type="button"
                onClick={() => setDiffMode('split')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  diffMode === 'split'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Before / After Split
              </button>
              <button
                type="button"
                onClick={() => setDiffMode('unified')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  diffMode === 'unified'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Unified Line Diff
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-800">
            {diffs.map((fileDiff) => {
              const changeObj = patchBundle.changes.find(
                (c) => c.filePath === fileDiff.filePath
              );
              const beforeLines = (changeObj?.originalContent || '')
                .replace(/\r\n/g, '\n')
                .split('\n');
              const afterLines = (changeObj?.proposedContent || '')
                .replace(/\r\n/g, '\n')
                .split('\n');

              return (
                <div key={fileDiff.filePath} className="flex flex-col">
                  <div className="px-5 py-2.5 bg-[#0B0F17] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-semibold text-slate-100">
                        {fileDiff.filePath}
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="text-emerald-400 tabular-nums">
                        +{fileDiff.addedCount} added
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="text-rose-400 tabular-nums">
                        -{fileDiff.removedCount} removed
                      </span>
                    </div>
                    <span className="text-slate-400">
                      {fileDiff.explanation}
                    </span>
                  </div>

                  {diffMode === 'split' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800 bg-[#080B11] font-mono text-xs">
                      {/* Before Column */}
                      <div className="overflow-x-auto p-3">
                        <div className="text-[11px] font-sans font-semibold text-rose-300/90 pb-2 mb-2 border-b border-slate-800/80">
                          Before (Original Read-Only — a/{fileDiff.filePath})
                        </div>
                        <table className="w-full border-collapse">
                          <tbody>
                            {beforeLines.map((line, i) => {
                              const isRemoved = fileDiff.lines.some(
                                (dl) =>
                                  dl.type === 'remove' &&
                                  dl.oldLineNumber === i + 1
                              );
                              return (
                                <tr
                                  key={i}
                                  className={
                                    isRemoved
                                      ? 'bg-rose-500/15 text-rose-200'
                                      : 'text-slate-300'
                                  }
                                >
                                  <td className="select-none pr-3 text-right text-slate-600 tabular-nums w-9 align-top">
                                    {i + 1}
                                  </td>
                                  <td className="select-none pr-2 w-4 text-rose-400">
                                    {isRemoved ? '-' : ' '}
                                  </td>
                                  <td className="whitespace-pre">
                                    {line || ' '}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* After Column */}
                      <div className="overflow-x-auto p-3">
                        <div className="text-[11px] font-sans font-semibold text-emerald-300/90 pb-2 mb-2 border-b border-slate-800/80">
                          After (Proposed Patch — b/{fileDiff.filePath})
                        </div>
                        <table className="w-full border-collapse">
                          <tbody>
                            {afterLines.map((line, i) => {
                              const isAdded = fileDiff.lines.some(
                                (dl) =>
                                  dl.type === 'add' &&
                                  dl.newLineNumber === i + 1
                              );
                              return (
                                <tr
                                  key={i}
                                  className={
                                    isAdded
                                      ? 'bg-emerald-500/15 text-emerald-200'
                                      : 'text-slate-300'
                                  }
                                >
                                  <td className="select-none pr-3 text-right text-slate-600 tabular-nums w-9 align-top">
                                    {i + 1}
                                  </td>
                                  <td className="select-none pr-2 w-4 text-emerald-400">
                                    {isAdded ? '+' : ' '}
                                  </td>
                                  <td className="whitespace-pre">
                                    {line || ' '}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto p-4 bg-[#080B11] font-mono text-xs">
                      <table className="w-full border-collapse">
                        <tbody>
                          {fileDiff.lines.map((dl, idx) => (
                            <tr
                              key={idx}
                              className={
                                dl.type === 'add'
                                  ? 'bg-emerald-500/15 text-emerald-200'
                                  : dl.type === 'remove'
                                  ? 'bg-rose-500/15 text-rose-200'
                                  : 'text-slate-300'
                              }
                            >
                              <td className="select-none pr-2 text-right text-slate-600 tabular-nums w-9">
                                {dl.oldLineNumber ?? ''}
                              </td>
                              <td className="select-none pr-3 text-right text-slate-600 tabular-nums w-9">
                                {dl.newLineNumber ?? ''}
                              </td>
                              <td className="select-none pr-2 w-4 font-bold">
                                {dl.type === 'add'
                                  ? '+'
                                  : dl.type === 'remove'
                                  ? '-'
                                  : ' '}
                              </td>
                              <td className="whitespace-pre">
                                {dl.content || ' '}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
