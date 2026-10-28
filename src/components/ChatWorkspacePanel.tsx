import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Code2,
  FileCode2,
  GitPullRequest,
  HelpCircle,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Terminal,
  User,
  X,
  XCircle,
} from 'lucide-react';
import type {
  ChatMessageItem,
  CodeSelectionContext,
  ProposedPatchBundle,
  QuickAgentActionType,
  SandboxRunResponse,
} from '../types/repopilot';

interface ChatWorkspacePanelProps {
  messages: ChatMessageItem[];
  taskDescription: string;
  onChangeTaskDescription: (val: string) => void;
  selectionContext: CodeSelectionContext | null;
  onClearSelectionContext: () => void;
  patchBundle: ProposedPatchBundle | null;
  sandboxRunResult: SandboxRunResponse | null;
  isAnalyzing: boolean;
  isRunningSandbox: boolean;
  onSendMessage: (
    prompt: string,
    actionType?: QuickAgentActionType
  ) => void;
  onApprovePatch: () => void;
  onRejectOrRevertPatch: () => void;
  onApproveAndRunSandbox: () => void;
  onOpenDiffTab: () => void;
  onOpenSandboxTab: () => void;
  onSelectFile: (path: string) => void;
}

export const ChatWorkspacePanel: React.FC<ChatWorkspacePanelProps> = ({
  messages,
  taskDescription,
  onChangeTaskDescription,
  selectionContext,
  onClearSelectionContext,
  patchBundle,
  sandboxRunResult,
  isAnalyzing,
  isRunningSandbox,
  onSendMessage,
  onApprovePatch,
  onRejectOrRevertPatch,
  onApproveAndRunSandbox,
  onOpenDiffTab,
  onOpenSandboxTab,
  onSelectFile,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [clarificationText, setClarificationText] = useState<string>('');

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [messages.length, isAnalyzing, isRunningSandbox]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskDescription.trim() || isAnalyzing) return;
    onSendMessage(taskDescription.trim(), 'custom');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (taskDescription.trim() && !isAnalyzing) {
        onSendMessage(taskDescription.trim(), 'custom');
      }
    }
  };

  const isApproved = patchBundle?.approvalStatus === 'approved_staged';

  return (
    <section
      aria-label="AI Coding Agent Chat and Task History"
      className="w-full xl:w-[410px] shrink-0 h-full min-h-0 border-t xl:border-t-0 xl:border-l border-slate-800/90 bg-[#0B0F17] flex flex-col overflow-hidden"
    >
      {/* Fixed Panel Header */}
      <div className="shrink-0 px-3.5 py-2.5 border-b border-slate-800/90 bg-[#0E131F] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
          <h2 className="text-xs font-semibold text-slate-100 truncate">
            Agent Composer &amp; Task History
          </h2>
        </div>
        <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
          {messages.length} msg(s)
        </span>
      </div>

      {/* Independent Scrolling Chat Messages Area */}
      <div
        ref={scrollContainerRef}
        data-testid="chat-messages-scroll"
        className="flex-1 min-h-0 overflow-y-auto p-3.5 flex flex-col gap-3"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-lg border p-3 text-xs flex flex-col gap-2 ${
              msg.role === 'user'
                ? 'border-sky-500/30 bg-sky-950/20 text-slate-100 ml-3'
                : msg.role === 'system'
                ? 'border-slate-800 bg-[#0E131F] text-slate-300'
                : 'border-slate-800 bg-[#0E131F] text-slate-200 mr-1'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                {msg.role === 'user' ? (
                  <User className="w-3.5 h-3.5 text-sky-400" />
                ) : (
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>
                  {msg.role === 'user'
                    ? 'Developer'
                    : msg.role === 'system'
                    ? 'Workspace System'
                    : 'RepoPilot Agent'}
                </span>
                {msg.actionType && msg.actionType !== 'custom' && (
                  <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-[10px]">
                    {msg.actionType}
                  </span>
                )}
              </div>
              <span className="font-mono text-[10px] tabular-nums">
                {msg.lifecycleState || ''}
              </span>
            </div>

            {msg.selectionContext && (
              <div className="rounded border border-slate-700/80 bg-[#080B11] px-2.5 py-1.5 font-mono text-[10px] text-sky-300 flex items-center justify-between">
                <span>
                  Context: {msg.selectionContext.filePath}:
                  {msg.selectionContext.startLine}-
                  {msg.selectionContext.endLine}
                </span>
                <Code2 className="w-3 h-3 text-sky-400" />
              </div>
            )}

            <p className="leading-relaxed whitespace-pre-wrap text-slate-200">
              {msg.content}
            </p>

            {/* Show Inspected & Modified Files */}
            {(msg.inspectedFiles?.length || msg.modifiedFiles?.length) ? (
              <div className="pt-1.5 border-t border-slate-800/80 flex flex-col gap-1.5 text-[11px]">
                {msg.inspectedFiles && msg.inspectedFiles.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-slate-400 font-medium">
                      Inspected ({msg.inspectedFiles.length}):
                    </span>
                    {msg.inspectedFiles.map((fp) => (
                      <button
                        key={fp}
                        type="button"
                        onClick={() => onSelectFile(fp)}
                        className="px-1.5 py-0.5 rounded bg-slate-800/80 font-mono text-[10px] text-slate-300 hover:text-sky-300 cursor-pointer"
                      >
                        {fp}
                      </button>
                    ))}
                  </div>
                )}

                {msg.modifiedFiles && msg.modifiedFiles.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-emerald-400 font-medium">
                      Modified ({msg.modifiedFiles.length}):
                    </span>
                    {msg.modifiedFiles.map((fp) => (
                      <button
                        key={fp}
                        type="button"
                        onClick={() => {
                          onSelectFile(fp);
                          onOpenDiffTab();
                        }}
                        className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 font-mono text-[10px] text-emerald-300 hover:bg-emerald-500/25 cursor-pointer flex items-center gap-1"
                      >
                        <FileCode2 className="w-2.5 h-2.5" />
                        <span>{fp}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ))}

        {/* Active Patch Review & Clarifying Question Card in Chat Stream */}
        {patchBundle && (
          <div className="rounded-lg border border-slate-700/90 bg-[#0E131F] p-3 flex flex-col gap-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                <GitPullRequest className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  {patchBundle.needsClarification
                    ? 'Clarification Required'
                    : patchBundle.isNoChangeTask
                    ? 'No Code Modifications Needed'
                    : `Proposed Patch (${patchBundle.changes.length} file${
                        patchBundle.changes.length === 1 ? '' : 's'
                      })`}
                </span>
              </span>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {sandboxRunResult?.verificationStatus ||
                  patchBundle.verificationStatus}
              </span>
            </div>

            {patchBundle.needsClarification && patchBundle.clarifyingQuestion ? (
              <div className="flex flex-col gap-2">
                <div className="text-amber-200 flex items-start gap-1.5 leading-snug">
                  <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{patchBundle.clarifyingQuestion}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={clarificationText}
                    onChange={(e) => setClarificationText(e.target.value)}
                    placeholder="Reply with exact requirement..."
                    className="flex-1 min-w-0 rounded border border-amber-500/40 bg-[#0B0F17] px-2 py-1 text-xs text-slate-100 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!clarificationText.trim() || isAnalyzing}
                    onClick={() => {
                      onSendMessage(
                        `${taskDescription} — Clarification: ${clarificationText.trim()}`,
                        'fix-bug'
                      );
                      setClarificationText('');
                    }}
                    className="px-2.5 py-1 rounded bg-amber-400 text-slate-950 font-semibold text-[11px] hover:bg-amber-300 cursor-pointer disabled:opacity-50"
                  >
                    Reply
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {!patchBundle.isNoChangeTask && !isApproved && (
                  <button
                    type="button"
                    onClick={onApprovePatch}
                    disabled={!patchBundle.patchValidationPassed}
                    className="px-2.5 py-1.5 rounded bg-emerald-500 text-slate-950 font-semibold text-[11px] hover:bg-emerald-400 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Accept Patch</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onApproveAndRunSandbox}
                  disabled={isRunningSandbox || !patchBundle.patchValidationPassed}
                  className="px-2.5 py-1.5 rounded bg-sky-500 text-slate-950 font-semibold text-[11px] hover:bg-sky-400 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>
                    {isRunningSandbox
                      ? 'Running Tests...'
                      : 'Accept & Verify Tests'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onOpenDiffTab}
                  className="px-2.5 py-1.5 rounded border border-slate-700 bg-[#0B0F17] text-slate-200 text-[11px] hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Review Diff
                </button>

                {!patchBundle.isNoChangeTask && (
                  <button
                    type="button"
                    onClick={onRejectOrRevertPatch}
                    className="px-2.5 py-1.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-200 text-[11px] hover:bg-rose-500/20 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    {isApproved ? (
                      <>
                        <RotateCcw className="w-3 h-3" />
                        <span>Revert Patch</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3" />
                        <span>Reject</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {sandboxRunResult && (
              <div
                className={`rounded border p-2 text-[11px] font-mono flex items-center justify-between ${
                  sandboxRunResult.testOutcome === 'TESTS_PASSED'
                    ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
                    : sandboxRunResult.testOutcome === 'PARTIALLY_VERIFIED' ||
                      sandboxRunResult.testOutcome === 'NOT_VERIFIED'
                    ? 'border-amber-500/30 bg-amber-950/20 text-amber-200'
                    : 'border-rose-500/30 bg-rose-950/20 text-rose-200'
                }`}
              >
                <span>
                  {sandboxRunResult.testOutcome.replace('_', ' ')} (Retries:{' '}
                  {sandboxRunResult.retryCount}/{sandboxRunResult.maxRetries})
                </span>
                <button
                  type="button"
                  onClick={onOpenSandboxTab}
                  className="underline hover:text-white cursor-pointer"
                >
                  Logs
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fixed-Bottom Chat Input Bar */}
      <form
        onSubmit={handleFormSubmit}
        data-testid="chat-input-bar"
        className="shrink-0 border-t border-slate-800/90 bg-[#0E131F] p-3 flex flex-col gap-2"
      >
        {selectionContext && (
          <div className="flex items-center justify-between gap-2 rounded bg-sky-500/15 border border-sky-500/30 px-2.5 py-1 text-[11px] font-mono text-sky-200">
            <span className="truncate">
              Attached Selection: {selectionContext.filePath} (L
              {selectionContext.startLine}-{selectionContext.endLine})
            </span>
            <button
              type="button"
              onClick={onClearSelectionContext}
              className="text-sky-300 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            aria-label="Chat Prompt Input"
            rows={2}
            value={taskDescription}
            onChange={(e) => onChangeTaskDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask RepoPilot to fix a bug, explain selected code, refactor, or add tests..."
            className="flex-1 min-w-0 rounded-lg border border-slate-700/90 bg-[#0B0F17] p-2.5 text-xs text-slate-100 leading-relaxed focus:border-sky-400 focus:outline-none resize-none"
          />
          <button
            type="submit"
            disabled={isAnalyzing || !taskDescription.trim()}
            className="h-9 px-3 rounded-lg bg-sky-500 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isAnalyzing ? (
              <Play className="w-3.5 h-3.5 animate-pulse" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Send</span>
          </button>
        </div>
      </form>
    </section>
  );
};
