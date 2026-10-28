import React, { useMemo, useState } from 'react';
import {
  Bug,
  Check,
  Code2,
  Edit3,
  Eye,
  FileCode2,
  FlaskConical,
  GitBranch,
  Lock,
  RotateCcw,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import type {
  CodeSelectionContext,
  ProposedPatchBundle,
  QuickAgentActionType,
  RepoFile,
} from '../types/repopilot';
import { analyzeRepositoryStructure } from '../utils/repoAnalyzer';
import { renderHighlightedLine } from '../utils/syntaxHighlighter';

interface RepoExplorerViewProps {
  originalFiles: RepoFile[];
  stagedFiles: RepoFile[];
  selectedFilePath: string;
  openTabs: string[];
  onSelectFile: (path: string) => void;
  onCloseTab: (path: string) => void;
  editorDrafts: Record<string, string>;
  onUpdateDraft: (path: string, newContent: string) => void;
  onSaveDraftToWorkspace: (path: string) => void;
  onRevertFileToOriginal: (path: string) => void;
  selectionContext: CodeSelectionContext | null;
  onChangeSelectionContext: (sel: CodeSelectionContext | null) => void;
  onTriggerQuickAction: (
    action: QuickAgentActionType,
    selection?: CodeSelectionContext | null
  ) => void;
  patchBundle: ProposedPatchBundle | null;
  viewingStagedCopy: boolean;
  onToggleViewingStagedCopy: (staged: boolean) => void;
  onJumpToDiff: () => void;
  isAnalyzing?: boolean;
}

export const RepoExplorerView: React.FC<RepoExplorerViewProps> = ({
  originalFiles,
  stagedFiles,
  selectedFilePath,
  openTabs,
  onSelectFile,
  onCloseTab,
  editorDrafts,
  onUpdateDraft,
  onSaveDraftToWorkspace,
  onRevertFileToOriginal,
  selectionContext,
  onChangeSelectionContext,
  onTriggerQuickAction,
  patchBundle,
  viewingStagedCopy,
  onToggleViewingStagedCopy,
  onJumpToDiff,
  isAnalyzing = false,
}) => {
  const [editorMode, setEditorMode] = useState<'highlighted' | 'edit'>(
    'highlighted'
  );
  const [selectionAnchorLine, setSelectionAnchorLine] = useState<number | null>(
    null
  );

  const activeFileList = viewingStagedCopy ? stagedFiles : originalFiles;
  const activeFile =
    activeFileList.find((f) => f.path === selectedFilePath) ||
    activeFileList[0];
  const immutableOrigFile = originalFiles.find(
    (f) => f.path === activeFile?.path
  );

  const modifiedPaths = new Set(
    patchBundle?.changes.map((c) => c.filePath) || []
  );

  const currentContent = activeFile
    ? editorDrafts[activeFile.path] !== undefined
      ? editorDrafts[activeFile.path]
      : activeFile.content
    : '';

  const isDirty = Boolean(
    activeFile &&
      editorDrafts[activeFile.path] !== undefined &&
      editorDrafts[activeFile.path] !== activeFile.content
  );

  const differsFromImmutableOriginal = Boolean(
    activeFile &&
      immutableOrigFile &&
      currentContent !== immutableOrigFile.content
  );

  const repoUnderstanding = useMemo(
    () => analyzeRepositoryStructure(activeFileList),
    [activeFileList]
  );

  const activeSymbolMeta = activeFile
    ? repoUnderstanding.symbolMap.get(activeFile.path)
    : undefined;

  const crossFileReferences = useMemo(() => {
    if (!activeFile) return [];
    return repoUnderstanding.callerEdges.filter(
      (e) =>
        e.callerFile === activeFile.path || e.calleeFile === activeFile.path
    );
  }, [activeFile, repoUnderstanding.callerEdges]);

  const lines = useMemo(
    () => currentContent.replace(/\r\n/g, '\n').split('\n'),
    [currentContent]
  );

  const handleLineClick = (lineNumber: number) => {
    if (!activeFile) return;
    if (
      selectionAnchorLine === null ||
      selectionContext?.filePath !== activeFile.path
    ) {
      setSelectionAnchorLine(lineNumber);
      const start = Math.max(1, lineNumber - 2);
      const end = Math.min(lines.length, lineNumber + 4);
      const snippet = lines.slice(start - 1, end).join('\n');
      onChangeSelectionContext({
        filePath: activeFile.path,
        language: activeFile.language,
        startLine: start,
        endLine: end,
        selectedText: snippet,
      });
    } else {
      const start = Math.min(selectionAnchorLine, lineNumber);
      const end = Math.max(selectionAnchorLine, lineNumber);
      const snippet = lines.slice(start - 1, end).join('\n');
      onChangeSelectionContext({
        filePath: activeFile.path,
        language: activeFile.language,
        startLine: start,
        endLine: end,
        selectedText: snippet,
      });
      setSelectionAnchorLine(null);
    }
  };

  const handleTextareaSelect = (
    e: React.SyntheticEvent<HTMLTextAreaElement>
  ) => {
    if (!activeFile) return;
    const target = e.currentTarget;
    const startOffset = target.selectionStart;
    const endOffset = target.selectionEnd;
    if (endOffset > startOffset) {
      const selectedText = target.value.slice(startOffset, endOffset);
      const startLine = target.value.slice(0, startOffset).split('\n').length;
      const endLine = target.value.slice(0, endOffset).split('\n').length;
      onChangeSelectionContext({
        filePath: activeFile.path,
        language: activeFile.language,
        startLine,
        endLine,
        selectedText,
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Top Bar: Language Toolchain + Snapshot Mode Toggle */}
      <div className="rounded-lg border border-slate-800 bg-[#0E131F] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-semibold text-slate-100">
            Language Toolchain:
          </span>
          <span className="font-mono text-sky-300">
            {repoUnderstanding.toolchain.primaryLanguage}
          </span>
          <span className="text-slate-600">·</span>
          <span className="font-mono text-slate-300">
            Pkg: {repoUnderstanding.toolchain.packageManager}
          </span>
          <span className="text-slate-600">·</span>
          <span className="font-mono text-amber-300">
            Test: {repoUnderstanding.toolchain.recommendedTestCommand}
          </span>
        </div>

        <div
          role="group"
          aria-label="Workspace Snapshot Selector"
          className="flex items-center gap-1 rounded-lg bg-[#0B0F17] p-1 border border-slate-800"
        >
          <button
            type="button"
            onClick={() => onToggleViewingStagedCopy(false)}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              !viewingStagedCopy
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Original Repo
          </button>
          <button
            type="button"
            onClick={() => onToggleViewingStagedCopy(true)}
            disabled={
              !patchBundle || patchBundle.approvalStatus !== 'approved_staged'
            }
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              viewingStagedCopy
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Approved Staged Copy
          </button>
        </div>
      </div>

      {/* Cursor-like Quick AI Coding Actions Strip */}
      <div className="rounded-lg border border-slate-800 bg-[#0E131F] px-3.5 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1 mr-1">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>AI Actions:</span>
          </span>

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() =>
              onTriggerQuickAction('explain-code', selectionContext)
            }
            className="px-2.5 py-1 rounded border border-slate-700 bg-[#0B0F17] text-[11px] font-medium text-slate-200 hover:border-sky-500/50 hover:text-sky-200 transition-colors cursor-pointer disabled:opacity-50"
          >
            Explain Code
          </button>

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() => onTriggerQuickAction('find-bug', selectionContext)}
            className="px-2.5 py-1 rounded border border-slate-700 bg-[#0B0F17] text-[11px] font-medium text-amber-200 hover:border-amber-500/50 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
          >
            <Bug className="w-3 h-3 text-amber-400" />
            <span>Find Bug</span>
          </button>

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() => onTriggerQuickAction('fix-bug', selectionContext)}
            className="px-2.5 py-1 rounded border border-sky-500/40 bg-sky-500/15 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/25 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
          >
            <Wand2 className="w-3 h-3 text-sky-400" />
            <span>Fix Bug</span>
          </button>

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() => onTriggerQuickAction('refactor', selectionContext)}
            className="px-2.5 py-1 rounded border border-slate-700 bg-[#0B0F17] text-[11px] font-medium text-slate-200 hover:border-sky-500/50 hover:text-sky-200 transition-colors cursor-pointer disabled:opacity-50"
          >
            Refactor
          </button>

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() =>
              onTriggerQuickAction('generate-tests', selectionContext)
            }
            className="px-2.5 py-1 rounded border border-slate-700 bg-[#0B0F17] text-[11px] font-medium text-emerald-200 hover:border-emerald-500/50 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
          >
            <FlaskConical className="w-3 h-3 text-emerald-400" />
            <span>Generate Tests</span>
          </button>

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() =>
              onTriggerQuickAction('implement-feature', selectionContext)
            }
            className="px-2.5 py-1 rounded border border-slate-700 bg-[#0B0F17] text-[11px] font-medium text-slate-200 hover:border-sky-500/50 hover:text-sky-200 transition-colors cursor-pointer disabled:opacity-50"
          >
            Implement Feature
          </button>
        </div>

        {selectionContext && (
          <div className="flex items-center gap-1.5 rounded bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-[11px] font-mono text-sky-200">
            <span>
              Selected: {selectionContext.filePath}:{selectionContext.startLine}
              -{selectionContext.endLine}
            </span>
            <button
              type="button"
              onClick={() => onChangeSelectionContext(null)}
              className="text-sky-300 hover:text-white cursor-pointer"
              title="Clear code selection"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Multi-Tab Code Editor Container */}
      <div className="rounded-lg border border-slate-800 bg-[#0E131F] flex flex-col overflow-hidden">
        {/* Open File Tabs Bar */}
        <div
          role="tablist"
          aria-label="Open Editor Tabs"
          className="flex items-center overflow-x-auto border-b border-slate-800 bg-[#0B0F17] px-2 pt-1.5 gap-1"
        >
          {openTabs.map((tabPath) => {
            const isTabActive = activeFile?.path === tabPath;
            const tabName = tabPath.split('/').pop() || tabPath;
            const tabDirty =
              editorDrafts[tabPath] !== undefined &&
              editorDrafts[tabPath] !==
                activeFileList.find((f) => f.path === tabPath)?.content;
            const tabModified = modifiedPaths.has(tabPath);

            return (
              <div
                key={tabPath}
                className={`group flex items-center gap-2 rounded-t-md border-t border-x px-3 py-1.5 text-xs font-mono transition-colors shrink-0 ${
                  isTabActive
                    ? 'border-slate-700 bg-[#0E131F] text-sky-300 font-semibold'
                    : 'border-transparent bg-slate-900/60 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isTabActive}
                  onClick={() => onSelectFile(tabPath)}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <FileCode2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>{tabName}</span>
                  {tabDirty && (
                    <span
                      title="Unsaved changes"
                      className="text-amber-400 font-bold"
                    >
                      ●
                    </span>
                  )}
                  {tabModified && !tabDirty && (
                    <span className="text-[10px] text-emerald-400">M</span>
                  )}
                </button>
                {openTabs.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Close ${tabName}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tabPath);
                    }}
                    className="text-slate-500 hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {activeFile ? (
          <>
            {/* Editor Toolbar */}
            <div className="px-4 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-[#0E131F]">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-300">
                <span className="font-semibold text-slate-100">
                  {activeFile.path}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] uppercase text-sky-300">
                  {activeFile.language}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400 tabular-nums">
                  {lines.length} lines
                </span>
                {activeSymbolMeta &&
                  (activeSymbolMeta.definedFunctions.length > 0 ||
                    activeSymbolMeta.definedClasses.length > 0) && (
                    <>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-400 truncate max-w-[260px]">
                        Symbols:{' '}
                        {[
                          ...activeSymbolMeta.definedClasses,
                          ...activeSymbolMeta.definedFunctions,
                        ].join(', ')}
                      </span>
                    </>
                  )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded border border-slate-700 bg-[#0B0F17] p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setEditorMode('highlighted')}
                    className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] font-medium cursor-pointer ${
                      editorMode === 'highlighted'
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Eye className="w-3 h-3 text-sky-400" />
                    <span>Highlight &amp; Select</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode('edit')}
                    className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] font-medium cursor-pointer ${
                      editorMode === 'edit'
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Edit3 className="w-3 h-3 text-amber-400" />
                    <span>Edit Code</span>
                  </button>
                </div>

                {isDirty && (
                  <button
                    type="button"
                    onClick={() => onSaveDraftToWorkspace(activeFile.path)}
                    className="px-2.5 py-1 rounded bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply Edit</span>
                  </button>
                )}

                {(isDirty || differsFromImmutableOriginal) && (
                  <button
                    type="button"
                    onClick={() => onRevertFileToOriginal(activeFile.path)}
                    className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800/80 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Restore original unmodified repository file"
                  >
                    <RotateCcw className="w-3 h-3 text-rose-400" />
                    <span>Revert to Original</span>
                  </button>
                )}

                {modifiedPaths.has(activeFile.path) && (
                  <button
                    type="button"
                    onClick={onJumpToDiff}
                    className="px-2.5 py-1 rounded bg-sky-500/15 border border-sky-500/30 text-xs font-medium text-sky-300 hover:bg-sky-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Inspect Diff
                  </button>
                )}
              </div>
            </div>

            {/* Editor Body: Either Syntax-Highlighted Line Selector OR Editable Code Buffer */}
            {editorMode === 'edit' ? (
              <div className="p-3 bg-[#080B11] flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    Editing <code className="text-sky-300">{activeFile.path}</code>{' '}
                    — highlight any snippet in the editor to attach it as AI selection context.
                  </span>
                  {isDirty && (
                    <span className="text-amber-300 font-mono">
                      ● Unsaved buffer modifications
                    </span>
                  )}
                </div>
                <textarea
                  aria-label={`Code Editor for ${activeFile.path}`}
                  value={currentContent}
                  onChange={(e) =>
                    onUpdateDraft(activeFile.path, e.target.value)
                  }
                  onSelect={handleTextareaSelect}
                  rows={Math.min(28, Math.max(14, lines.length + 2))}
                  spellCheck={false}
                  className="w-full rounded border border-slate-800 bg-[#05070B] p-3 font-mono text-xs text-slate-100 leading-relaxed focus:border-sky-500 focus:outline-none overflow-x-auto"
                />
              </div>
            ) : (
              <div className="overflow-x-auto p-3 bg-[#080B11] font-mono text-xs leading-relaxed">
                <div className="text-[11px] font-sans text-slate-400 pb-2 mb-2 border-b border-slate-800/80 flex items-center justify-between">
                  <span>
                    Click any line number (or start line then end line) to select code for AI inspection, or switch to{' '}
                    <strong className="text-slate-200">Edit Code</strong> to modify directly.
                  </span>
                  <Code2 className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <table className="w-full border-collapse">
                  <tbody>
                    {lines.map((lineText, idx) => {
                      const lineNum = idx + 1;
                      const isLineSelected =
                        selectionContext?.filePath === activeFile.path &&
                        lineNum >= selectionContext.startLine &&
                        lineNum <= selectionContext.endLine;

                      return (
                        <tr
                          key={idx}
                          onClick={() => handleLineClick(lineNum)}
                          className={`transition-colors cursor-pointer ${
                            isLineSelected
                              ? 'bg-sky-500/20'
                              : 'hover:bg-slate-800/35'
                          }`}
                        >
                          <td className="select-none pr-4 text-right text-slate-500 hover:text-sky-400 tabular-nums w-10 align-top">
                            {lineNum}
                          </td>
                          <td className="text-slate-200 whitespace-pre">
                            {renderHighlightedLine(
                              lineText,
                              activeFile.language
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Cross-File References Footer */}
            {crossFileReferences.length > 0 && (
              <div className="px-4 py-2 bg-[#0B0F17] border-t border-slate-800 flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400">
                <span className="flex items-center gap-1 text-slate-300 font-sans font-medium">
                  <GitBranch className="w-3.5 h-3.5 text-sky-400" />
                  <span>Cross-File Symbol References:</span>
                </span>
                {crossFileReferences.map((edge, idx) => {
                  const targetPath =
                    edge.callerFile === activeFile.path
                      ? edge.calleeFile
                      : edge.callerFile;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onSelectFile(targetPath)}
                      className="px-2 py-0.5 rounded bg-slate-800/80 text-sky-300 hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      {edge.callerFile} → {edge.calleeFile} (
                      {edge.symbols.join(', ')})
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400">
            Select a repository file in the left Explorer Tree to open it in the editor.
          </div>
        )}
      </div>
    </div>
  );
};
