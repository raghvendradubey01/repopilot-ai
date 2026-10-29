import React from 'react';
import {
  Activity,
  AlertTriangle,
  FileCode2,
  Layers,
  Terminal,
} from 'lucide-react';
import type {
  AgentDiagnosticsReport,
  ProposedPatchBundle,
  RepoFile,
  SandboxRunResponse,
} from '../types/repopilot';
import {
  detectLanguageToolchain,
  selectContextForTask,
} from '../utils/repoAnalyzer';

interface DiagnosticsPanelViewProps {
  files: RepoFile[];
  taskDescription: string;
  contextTokenBudget: number;
  onChangeContextTokenBudget: (budget: number) => void;
  patchBundle: ProposedPatchBundle | null;
  sandboxRunResult: SandboxRunResponse | null;
}

export const DiagnosticsPanelView: React.FC<DiagnosticsPanelViewProps> = ({
  files,
  taskDescription,
  contextTokenBudget,
  onChangeContextTokenBudget,
  patchBundle,
  sandboxRunResult,
}) => {
  const activeDiagnostics: AgentDiagnosticsReport | undefined =
    sandboxRunResult?.diagnostics || patchBundle?.diagnostics;

  const liveContextPreview = React.useMemo(
    () => selectContextForTask(files, taskDescription, contextTokenBudget),
    [files, taskDescription, contextTokenBudget]
  );

  const toolchain = React.useMemo(
    () =>
      activeDiagnostics?.toolchainProfile || detectLanguageToolchain(files),
    [activeDiagnostics?.toolchainProfile, files]
  );

  const contextReport = activeDiagnostics?.contextReport || liveContextPreview;

  return (
    <div className="flex flex-col gap-5">
      {/* Top Summary: Model, Context Tokens & Verification State */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131F] p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              <span>Developer Evaluation &amp; Agent Diagnostics Panel</span>
            </h3>
            <p className="text-xs text-slate-400">
              Inspects context selection, token budget, truncation warnings, toolchain manifests, JSON schema validation retries, patch syntax/import checks, and test outputs (secrets redacted).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label
              htmlFor="context-budget-select"
              className="text-xs font-medium text-slate-300"
            >
              Context Token Budget:
            </label>
            <select
              id="context-budget-select"
              value={contextTokenBudget}
              onChange={(e) =>
                onChangeContextTokenBudget(Number(e.target.value))
              }
              className="rounded-md border border-slate-700 bg-[#0B0F17] px-2.5 py-1 text-xs font-mono text-slate-100 focus:border-sky-400 focus:outline-none"
            >
              <option value={250}>250 tokens (Strict Excerpt Test)</option>
              <option value={2000}>2,000 tokens (Compact)</option>
              <option value={8000}>8,000 tokens (Standard)</option>
              <option value={16000}>16,000 tokens (Extended)</option>
            </select>
          </div>
        </div>

        {/* Key Telemetry Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 flex flex-col gap-1">
            <span className="text-slate-400">Model Provider &amp; Identifier</span>
            <span className="font-semibold text-slate-100 truncate">
              {activeDiagnostics?.providerName || 'Google Gemini (Server SDK)'}
            </span>
            <span className="font-mono text-[11px] text-sky-400 truncate">
              {activeDiagnostics?.modelIdentifier || 'gemini-3-flash-preview'}
            </span>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 flex flex-col gap-1">
            <span className="text-slate-400">Detected Toolchain &amp; Runner</span>
            <span className="font-semibold text-slate-100 truncate">
              {toolchain.primaryLanguage.toUpperCase()} · {toolchain.testFramework}
            </span>
            <span className="font-mono text-[11px] text-slate-400 truncate">
              Pkg: {toolchain.packageManager} · Build: {toolchain.buildSystem}
            </span>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 flex flex-col gap-1">
            <span className="text-slate-400">Context Token Utilization</span>
            <span className="font-mono font-semibold text-slate-100 tabular-nums">
              {contextReport.totalEstimatedTokens} /{' '}
              {contextReport.maxTokenBudget} tokens
            </span>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              Included: {contextReport.includedFiles.length} · Excluded:{' '}
              {contextReport.excludedFiles.length}
            </span>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 flex flex-col gap-1">
            <span className="text-slate-400">Repair &amp; Final Verification</span>
            <span className="font-mono font-semibold text-slate-100">
              Status:{' '}
              {sandboxRunResult?.verificationStatus ||
                patchBundle?.verificationStatus ||
                'NOT_VERIFIED'}
            </span>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              Outcome:{' '}
              {sandboxRunResult?.testOutcome ||
                patchBundle?.testOutcome ||
                'NOT_VERIFIED'}{' '}
              · Retries:{' '}
              {sandboxRunResult?.retryCount ??
                activeDiagnostics?.repairAttemptsCount ??
                0}
              /2
            </span>
          </div>
        </div>

        {/* Context Truncation Warnings */}
        {contextReport.truncationWarnings &&
          contextReport.truncationWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/25 p-3 text-xs text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <strong className="text-amber-100">
                  Context Budget Truncation Warnings ({contextReport.truncationWarnings.length})
                </strong>
                <ul className="list-disc list-inside font-mono text-[11px] text-amber-200/90">
                  {contextReport.truncationWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
      </section>

      {/* Section 2: Context Selection & Dependency Graph */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131F] p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h4 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <span>
              01. Context Selection Report (Symbol &amp; Caller Dependency Ranking)
            </span>
          </h4>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            {contextReport.includedFiles.length} included ·{' '}
            {contextReport.excludedFiles.length} excluded
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0B0F17] text-slate-400">
                <th className="py-2 px-3 font-medium">File Path</th>
                <th className="py-2 px-3 font-medium">Status / Mode</th>
                <th className="py-2 px-3 font-medium">Selection Reason</th>
                <th className="py-2 px-3 font-medium">Lines</th>
                <th className="py-2 px-3 font-medium text-right">
                  Est. Tokens
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {contextReport.includedFiles.map((item) => (
                <tr key={item.path} className="hover:bg-slate-800/30">
                  <td className="py-2 px-3 text-slate-100">{item.path}</td>
                  <td className="py-2 px-3 text-emerald-400">
                    INCLUDED ({item.mode.toUpperCase()})
                  </td>
                  <td className="py-2 px-3 text-slate-300">{item.reason}</td>
                  <td className="py-2 px-3 text-slate-400 tabular-nums">
                    {item.includedLineRange || item.totalLines}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-200 tabular-nums">
                    {item.estimatedTokens}
                  </td>
                </tr>
              ))}
              {contextReport.excludedFiles.map((ex) => (
                <tr
                  key={ex.path}
                  className="bg-slate-900/40 text-slate-500 hover:bg-slate-800/20"
                >
                  <td className="py-2 px-3">{ex.path}</td>
                  <td className="py-2 px-3 text-amber-400/80">EXCLUDED</td>
                  <td className="py-2 px-3">{ex.reason}</td>
                  <td className="py-2 px-3">—</td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {ex.estimatedTokens}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {contextReport.symbolGraphSummary.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 text-xs flex flex-col gap-1.5">
            <span className="font-semibold text-slate-200">
              Caller / Callee Symbol Dependency Edges:
            </span>
            <div className="font-mono text-[11px] text-slate-300 flex flex-col gap-1">
              {contextReport.symbolGraphSummary.map((edge, idx) => (
                <div key={idx}>{edge}</div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Section 3: Schema Validation, Patch Application & Test Execution Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border border-slate-800 bg-[#0E131F] p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <h4 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-emerald-400" />
              <span>02. Response Schema &amp; Patch Validation Checks</span>
            </h4>
          </div>

          {!activeDiagnostics ? (
            <p className="text-xs text-slate-400">
              Run &ldquo;Analyze &amp; Generate Plan + Patch&rdquo; to populate response schema and patch validation diagnostics.
            </p>
          ) : (
            <div className="flex flex-col gap-3 text-xs">
              <div>
                <span className="font-semibold text-slate-200">
                  Response Schema Validation Errors:
                </span>
                {activeDiagnostics.responseValidationErrors.length === 0 ? (
                  <div className="text-emerald-400 font-mono mt-1">
                    None — Model response matched required 9-field JSON schema.
                  </div>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1 font-mono text-rose-300">
                    {activeDiagnostics.responseValidationErrors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <span className="font-semibold text-slate-200">
                  Patch Application &amp; Multi-Language Syntax/Import Diagnostics:
                </span>
                {activeDiagnostics.patchValidationDiagnostics.length === 0 ? (
                  <div className="text-slate-400 font-mono mt-1">
                    No file modifications proposed (0 patches).
                  </div>
                ) : (
                  <div className="mt-1.5 flex flex-col gap-2">
                    {activeDiagnostics.patchValidationDiagnostics.map((d) => (
                      <div
                        key={d.filePath}
                        className="rounded border border-slate-800 bg-[#0B0F17] p-2.5 font-mono text-[11px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-slate-100 font-semibold">
                            {d.filePath}
                          </span>
                          <span
                            className={
                              d.valid ? 'text-emerald-400' : 'text-rose-400'
                            }
                          >
                            {d.valid ? 'VALID PATCH' : 'INVALID PATCH'}
                          </span>
                        </div>
                        <div className="text-slate-400 mt-1">
                          Clean Hunks: {d.appliesCleanly ? 'PASS' : 'FAIL'} ·
                          Syntax: {d.syntaxValid ? 'PASS' : 'FAIL'} · Imports:{' '}
                          {d.importsValid ? 'PASS' : 'FAIL'}
                        </div>
                        {d.errors.length > 0 && (
                          <div className="mt-1.5">
                            <span className="text-rose-400 font-semibold">
                              Confirmed Errors:
                            </span>
                            <ul className="mt-0.5 text-rose-300">
                              {d.errors.map((err, i) => (
                                <li key={i}>- {err}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {d.warnings && d.warnings.length > 0 && (
                          <div className="mt-1.5">
                            <span className="text-amber-400 font-semibold">
                              Possible Issues:
                            </span>
                            <ul className="mt-0.5 text-amber-300">
                              {d.warnings.map((warn, i) => (
                                <li key={i}>- {warn}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {d.contextChecks && d.contextChecks.length > 0 && (
                          <div className="mt-1.5">
                            <span className="text-sky-400 font-semibold">
                              Checks Requiring More Project Context:
                            </span>
                            <ul className="mt-0.5 text-sky-300/90">
                              {d.contextChecks.map((chk, i) => (
                                <li key={i}>- {chk}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-800 bg-[#0E131F] p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <h4 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-amber-400" />
              <span>03. Test Commands &amp; Execution Trace</span>
            </h4>
          </div>

          {!activeDiagnostics ? (
            <p className="text-xs text-slate-400">
              Test commands and outputs will appear here after analysis and verification.
            </p>
          ) : (
            <div className="flex flex-col gap-3 text-xs font-mono">
              <div className="rounded border border-slate-800 bg-[#0B0F17] p-2.5">
                <div className="text-slate-400 font-sans font-medium mb-1">
                  Targeted Test Command (Run First):
                </div>
                <div className="text-sky-300">
                  $ {activeDiagnostics.targetedTestCommand}
                </div>
              </div>

              <div className="rounded border border-slate-800 bg-[#0B0F17] p-2.5">
                <div className="text-slate-400 font-sans font-medium mb-1">
                  Full Suite Command:
                </div>
                <div className="text-emerald-300">
                  $ {activeDiagnostics.fullSuiteTestCommand}
                </div>
              </div>

              {sandboxRunResult && sandboxRunResult.attempts.length > 0 && (
                <div className="rounded border border-slate-800 bg-[#080B11] p-2.5 max-h-40 overflow-y-auto">
                  <div className="text-slate-400 font-sans font-medium mb-1">
                    Recorded Verification Attempts ({sandboxRunResult.attempts.length}):
                  </div>
                  {sandboxRunResult.attempts.map((att) => (
                    <div key={att.attempt} className="mb-2 last:mb-0">
                      <div className="text-slate-200">
                        Attempt #{att.attempt}: exit={att.exitCode ?? 'null'} (
                        {att.verificationStatus})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
