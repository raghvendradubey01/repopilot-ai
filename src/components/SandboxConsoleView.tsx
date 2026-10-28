import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  Play,
  RefreshCw,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import type {
  ProposedPatchBundle,
  SandboxExecutionMode,
  SandboxRunResponse,
} from '../types/repopilot';

interface SandboxConsoleViewProps {
  patchBundle: ProposedPatchBundle | null;
  sandboxMode: SandboxExecutionMode;
  onChangeSandboxMode: (mode: SandboxExecutionMode) => void;
  isolatedSandboxAvailable: boolean;
  sandboxRunResult: SandboxRunResponse | null;
  isRunningSandbox: boolean;
  onRunSandboxTests: () => void;
  onApproveAndRun: () => void;
  onDownloadPatchFile: () => void;
  onDownloadPatchedZip: () => void;
}

export const SandboxConsoleView: React.FC<SandboxConsoleViewProps> = ({
  patchBundle,
  sandboxMode,
  onChangeSandboxMode,
  isolatedSandboxAvailable,
  sandboxRunResult,
  isRunningSandbox,
  onRunSandboxTests,
  onApproveAndRun,
  onDownloadPatchFile,
  onDownloadPatchedZip,
}) => {
  const isApproved = patchBundle?.approvalStatus === 'approved_staged';

  return (
    <div className="flex flex-col gap-5">
      {/* Top Security & Sandbox Execution Policy Panel */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131F] p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-400" />
              <span>
                Multi-Language Test Verification &amp; Autonomous Repair Loop (Max 2 Retries)
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Runs targeted tests first, then full test suite (pytest, tsc/tsx, or static checks). Never executes untrusted uploaded code directly in the web server process.
            </p>
          </div>

          <div className="text-xs font-mono text-slate-300 tabular-nums">
            <span>RAM Limit: 128 MB</span>
            <span className="mx-2 text-slate-600">·</span>
            <span>CPU: 0.5 vCPU</span>
            <span className="mx-2 text-slate-600">·</span>
            <span>Timeout: 15s</span>
            <span className="mx-2 text-slate-600">·</span>
            <span>Network: Disabled</span>
          </div>
        </div>

        {/* Sandbox Policy Selector + Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-300">
              Sandbox Execution Policy:
            </span>
            <div
              role="group"
              aria-label="Sandbox Execution Policy"
              className="flex flex-wrap items-center gap-1.5 rounded-lg bg-[#0B0F17] p-1 border border-slate-800"
            >
              <button
                type="button"
                onClick={() => onChangeSandboxMode('demo_simulation_labeled')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  sandboxMode === 'demo_simulation_labeled'
                    ? 'bg-sky-500/20 text-sky-200 border border-sky-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Labeled Simulation Runner (Sample Repo Demo)
              </button>
              <button
                type="button"
                onClick={() => onChangeSandboxMode('strict_isolated_only')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  sandboxMode === 'strict_isolated_only'
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Strict Isolated Container Only
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {patchBundle && !isApproved && (
              <button
                type="button"
                onClick={onApproveAndRun}
                disabled={isRunningSandbox}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve Patch &amp; Run Sandbox</span>
              </button>
            )}

            <button
              type="button"
              onClick={onRunSandboxTests}
              disabled={!isApproved || isRunningSandbox}
              className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                {isRunningSandbox
                  ? 'Running Tests & Auto-Repair...'
                  : 'Execute Sandbox Verification'}
              </span>
            </button>

            {patchBundle && (
              <>
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
              </>
            )}
          </div>
        </div>

        {/* Honest Disclosure Banner based on Sandbox Availability & Mode */}
        {sandboxMode === 'strict_isolated_only' && !isolatedSandboxAvailable ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/25 p-3.5 text-xs text-amber-200 flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <strong className="text-amber-100">
                Isolated Execution Sandbox Unavailable on Host — Result Labeled NOT VERIFIED
              </strong>
              <span>
                No external Docker/gVisor microVM (`SANDBOX_RUNNER_URL` or `ENABLE_DOCKER_SANDBOX=true`) is attached to this server. When execution is unavailable in Strict Mode, the result is labeled <strong>NOT VERIFIED</strong> and test results are never fabricated.
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3.5 text-xs text-sky-200 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <strong className="text-sky-100">
                SIMULATED SANDBOX EXECUTION MODE (Sample Repository Demonstration)
              </strong>
              <span>
                Clearly Labeled Simulation: Targeted tests, full-suite checks, and up-to-2 self-healing repair retries are evaluated via deterministic static AST/invariant rules without executing untrusted code on the host OS. Languages without a sandbox test runner return <strong>PARTIALLY VERIFIED</strong>.
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Sandbox Execution Results & Retry Timeline */}
      {!sandboxRunResult ? (
        <div className="rounded-lg border border-slate-800 bg-[#0E131F] p-8 text-center flex flex-col items-center gap-3">
          <Terminal className="w-7 h-7 text-slate-400" />
          <div className="text-sm font-semibold text-slate-200">
            {!patchBundle
              ? 'Generate and Approve a Code Patch First (Status: NOT VERIFIED)'
              : !isApproved
              ? 'Patch Pending Approval before Sandbox Execution (Status: NOT VERIFIED)'
              : 'Ready to Run Targeted & Full Suite Verification'}
          </div>
          <p className="text-xs text-slate-400 max-w-md">
            {!patchBundle
              ? 'Use the AI Composer or left panel to analyze a task and propose a code patch.'
              : !isApproved
              ? 'Click "Approve Patch & Run Sandbox" above to stage the changes and execute verification.'
              : 'Click "Execute Sandbox Verification" to run targeted tests first, then the full suite, with up to 2 automatic AI repairs if any assertion fails.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Summary Status Bar */}
          <div
            className={`rounded-lg border p-4 flex flex-wrap items-center justify-between gap-4 ${
              sandboxRunResult.verificationStatus === 'VERIFIED'
                ? 'border-emerald-500/40 bg-emerald-950/20'
                : sandboxRunResult.verificationStatus === 'PARTIALLY_VERIFIED'
                ? 'border-sky-500/40 bg-sky-950/20'
                : sandboxRunResult.verificationStatus === 'NOT_VERIFIED'
                ? 'border-amber-500/40 bg-amber-950/20'
                : 'border-rose-500/40 bg-rose-950/20'
            }`}
          >
            <div className="flex items-center gap-3">
              {sandboxRunResult.verificationStatus === 'VERIFIED' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : sandboxRunResult.verificationStatus === 'PARTIALLY_VERIFIED' ||
                sandboxRunResult.verificationStatus === 'NOT_VERIFIED' ? (
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <div className="flex flex-col gap-0.5">
                <div className="text-xs font-semibold text-slate-100">
                  {sandboxRunResult.verificationStatus === 'VERIFIED'
                    ? sandboxRunResult.isSimulated
                      ? 'SIMULATED TEST SUITE PASSED — STATUS: VERIFIED (Outcome: TESTS PASSED)'
                      : 'ISOLATED SANDBOX TEST SUITE PASSED — STATUS: VERIFIED (Outcome: TESTS PASSED)'
                    : sandboxRunResult.verificationStatus === 'PARTIALLY_VERIFIED'
                    ? 'STATIC SYNTAX & IMPORT CHECKS PASSED — STATUS: PARTIALLY VERIFIED'
                    : sandboxRunResult.verificationStatus === 'NOT_VERIFIED'
                    ? 'EXECUTION UNAVAILABLE — STATUS: NOT VERIFIED'
                    : 'TESTS FAILED AFTER MAXIMUM RETRIES — STATUS: FAILED'}
                </div>
                <p className="text-xs text-slate-300">
                  {sandboxRunResult.bannerMessage}
                </p>
              </div>
            </div>

            <div className="text-xs font-mono text-slate-200 tabular-nums shrink-0">
              <span>
                Final Status: {sandboxRunResult.verificationStatus}
              </span>
              <span className="mx-2 text-slate-600">·</span>
              <span>
                Outcome: {sandboxRunResult.testOutcome || 'NOT_VERIFIED'}
              </span>
              <span className="mx-2 text-slate-600">·</span>
              <span>
                Auto-Repair Retries: {sandboxRunResult.retryCount} /{' '}
                {sandboxRunResult.maxRetries}
              </span>
            </div>
          </div>

          {/* Attempt-by-Attempt Console Output */}
          {sandboxRunResult.attempts.map((attempt) => (
            <div
              key={attempt.attempt}
              className="rounded-lg border border-slate-800 bg-[#0E131F] overflow-hidden flex flex-col"
            >
              <div className="px-4 py-3 bg-[#0B0F17] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 font-mono">
                  <span className="font-semibold text-slate-100">
                    Attempt #{attempt.attempt}
                    {attempt.attempt > 1
                      ? ` (Auto-Repair Retry ${attempt.attempt - 1}/${attempt.maxRetries})`
                      : ' (Initial Patch Verification)'}
                  </span>
                  <span className="text-slate-600">·</span>
                  <span
                    className={
                      attempt.status === 'passed'
                        ? 'text-emerald-400 font-semibold'
                        : attempt.status === 'partially_verified'
                        ? 'text-sky-300 font-semibold'
                        : attempt.status === 'not_verified' ||
                          attempt.status === 'sandbox_unavailable'
                        ? 'text-amber-300 font-semibold'
                        : 'text-rose-400 font-semibold'
                    }
                  >
                    Status: {attempt.verificationStatus}
                  </span>
                  {attempt.isSimulated && (
                    <>
                      <span className="text-slate-600">·</span>
                      <span className="text-sky-300">
                        [SIMULATED EXECUTION]
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 font-mono text-slate-400 tabular-nums">
                  <span>Passed: {attempt.passedCount}</span>
                  <span>·</span>
                  <span>Failed: {attempt.failedCount}</span>
                  <span>·</span>
                  <span>Exit Code: {attempt.exitCode ?? 'N/A'}</span>
                  <span>·</span>
                  <span>{attempt.durationMs} ms</span>
                </div>
              </div>

              <div className="p-3.5 bg-[#080B11] font-mono text-xs text-slate-200 max-h-44 overflow-y-auto flex flex-col gap-2">
                <div className="text-slate-400">$ {attempt.command}</div>
                {attempt.stdout && (
                  <pre className="whitespace-pre-wrap leading-snug text-slate-200">
                    {attempt.stdout}
                  </pre>
                )}
                {attempt.stderr && (
                  <pre className="whitespace-pre-wrap leading-snug text-rose-300">
                    {attempt.stderr}
                  </pre>
                )}
              </div>

              {attempt.repairAnalysis && (
                <div className="px-4 py-3 bg-sky-950/30 border-t border-sky-500/30 flex items-start gap-2.5 text-xs text-sky-200">
                  <RefreshCw className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-sky-100">
                      Autonomous Repair Agent Diagnosis (Retry {attempt.attempt} / {attempt.maxRetries}):
                    </strong>{' '}
                    {attempt.repairAnalysis}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
