import React, { useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  Laptop,
  MessageSquare,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Upload,
} from 'lucide-react';
import type { RepoFile, SampleRepositoryPreset } from '../types/repopilot';

export interface ConversationSessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  repoId: string;
}

interface MinimalSidebarProps {
  isOpen: boolean;
  onToggleSidebar: () => void;
  onNewChat: () => void;
  activeProjectName: string;
  activeRepoId: string;
  isWorkspaceConnected: boolean;
  onOpenWorkspaceModal: () => void;
  files: RepoFile[];
  selectedFilePath: string;
  modifiedPaths: Set<string>;
  dirtyPaths: Set<string>;
  onSelectFile: (path: string) => void;
  conversations: ConversationSessionSummary[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  onOpenSettings: (initialTab?: 'general' | 'vscode' | 'sandbox' | 'diagnostics') => void;
  sampleRepos: SampleRepositoryPreset[];
  onSelectSampleRepo: (repoId: string) => void;
  onUploadZipFile: (file: File) => void;
}

interface TreeDirectoryNode {
  name: string;
  fullPath: string;
  directories: Map<string, TreeDirectoryNode>;
  files: RepoFile[];
}

function buildDirectoryTree(files: RepoFile[]): TreeDirectoryNode {
  const root: TreeDirectoryNode = {
    name: '',
    fullPath: '',
    directories: new Map(),
    files: [],
  };

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      const dirPath = parts.slice(0, i + 1).join('/');
      if (!current.directories.has(dirName)) {
        current.directories.set(dirName, {
          name: dirName,
          fullPath: dirPath,
          directories: new Map(),
          files: [],
        });
      }
      current = current.directories.get(dirName)!;
    }
    current.files.push(file);
  }

  return root;
}

export const MinimalSidebar: React.FC<MinimalSidebarProps> = ({
  isOpen,
  onToggleSidebar,
  onNewChat,
  activeProjectName,
  isWorkspaceConnected,
  onOpenWorkspaceModal,
  files,
  selectedFilePath,
  modifiedPaths,
  dirtyPaths,
  onSelectFile,
  conversations,
  activeConversationId,
  onSelectConversation,
  onOpenSettings,
  onUploadZipFile,
}) => {
  const [explorerOpen, setExplorerOpen] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const toggleDirectory = (dirPath: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) =>
        f.path.toLowerCase().includes(q) ||
        f.content.toLowerCase().includes(q)
    );
  }, [files, searchQuery]);

  const treeRoot = useMemo(
    () => buildDirectoryTree(filteredFiles),
    [filteredFiles]
  );

  const handleZipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadZipFile(file);
      e.target.value = '';
    }
  };

  const renderTreeNode = (
    node: TreeDirectoryNode,
    depth = 0
  ): React.ReactNode => {
    const dirEntries = Array.from(node.directories.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const fileEntries = [...node.files].sort((a, b) =>
      a.path.localeCompare(b.path)
    );

    return (
      <>
        {dirEntries.map((dir) => {
          const isCollapsed = collapsedDirs.has(dir.fullPath);
          return (
            <div key={`dir-${dir.fullPath}`} className="flex flex-col">
              <button
                type="button"
                onClick={() => toggleDirectory(dir.fullPath)}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                className="w-full py-1 pr-2 text-left flex items-center gap-1.5 text-xs text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200 rounded-md transition-colors cursor-pointer"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                )}
                {isCollapsed ? (
                  <Folder className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                ) : (
                  <FolderOpen className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                )}
                <span className="truncate">{dir.name}</span>
              </button>
              {!isCollapsed && renderTreeNode(dir, depth + 1)}
            </div>
          );
        })}

        {fileEntries.map((file) => {
          const fileName = file.path.split('/').pop() || file.path;
          const isSelected = file.path === selectedFilePath;
          const isModified = modifiedPaths.has(file.path);
          const isDirty = dirtyPaths.has(file.path);

          return (
            <button
              key={file.path}
              type="button"
              onClick={() => onSelectFile(file.path)}
              style={{ paddingLeft: `${depth * 12 + 22}px` }}
              className={`w-full py-1 pr-2 text-left flex items-center justify-between gap-2 rounded-md text-xs transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-neutral-800 text-neutral-100 font-medium'
                  : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {file.language === 'markdown' ? (
                  <FileText className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                ) : (
                  <FileCode2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                )}
                <span className="truncate font-mono text-[11px]">
                  {fileName}
                </span>
              </span>
              {(isModified || isDirty) && (
                <span className="text-[10px] font-mono text-amber-400 shrink-0">
                  {isDirty ? 'edited' : 'changed'}
                </span>
              )}
            </button>
          );
        })}
      </>
    );
  };

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      aria-label="RepoPilot Sidebar"
      data-testid="left-sidebar"
      className="w-64 sm:w-72 shrink-0 h-full bg-[#141416] border-r border-neutral-800/80 flex flex-col select-none overflow-hidden"
    >
      {/* 1. Top Header: Logo + Name + Collapse Sidebar Button */}
      <div className="shrink-0 h-14 px-3.5 flex items-center justify-between border-b border-neutral-800/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-neutral-100 text-neutral-900 flex items-center justify-center shrink-0">
            <Code2 className="w-4 h-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-neutral-100 truncate">
            RepoPilot AI
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/70 transition-colors cursor-pointer"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Prominent "New Chat" Button */}
      <div className="shrink-0 p-3 pb-2">
        <button
          type="button"
          onClick={onNewChat}
          className="w-full py-2 px-3 rounded-lg bg-neutral-100 text-neutral-900 hover:bg-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>
      </div>

      {/* 3. Compact Workspace Section */}
      <div className="shrink-0 px-3 py-2 border-b border-neutral-800/60">
        <div className="rounded-lg border border-neutral-800 bg-[#1A1A1E] p-2.5 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Laptop className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <span
                className="text-xs font-medium text-neutral-200 truncate"
                title={activeProjectName}
              >
                { isWorkspaceConnected ? activeProjectName : 'No workspace connected' }
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenWorkspaceModal}
              className="text-[11px] font-medium text-neutral-300 hover:text-white underline underline-offset-2 shrink-0 cursor-pointer"
            >
              {isWorkspaceConnected ? 'Change' : 'Connect'}
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-neutral-400">
            <span>
              {isWorkspaceConnected
                ? `${files.length} files indexed`
                : 'Connect VS Code project'}
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-neutral-400 hover:text-neutral-200 flex items-center gap-1 cursor-pointer"
              title="Optional: Import a project ZIP archive"
            >
              <Upload className="w-3 h-3" />
              <span>Import project</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleZipChange}
              className="hidden"
              aria-label="Import project ZIP"
            />
          </div>
        </div>
      </div>

      {/* 4. Collapsible File Explorer (Independently Scrollable) */}
      <div className="flex-1 min-h-0 flex flex-col border-b border-neutral-800/60 overflow-hidden">
        <button
          type="button"
          onClick={() => setExplorerOpen((prev) => !prev)}
          aria-expanded={explorerOpen}
          className="shrink-0 px-3.5 py-2 flex items-center justify-between text-xs font-medium text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            {explorerOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <span>Workspace Files</span>
          </span>
          <span className="font-mono text-[11px] text-neutral-500 tabular-nums">
            {files.length}
          </span>
        </button>

        {explorerOpen && isWorkspaceConnected && (
          <div className="flex-1 min-h-0 flex flex-col px-2.5 pb-2 gap-1.5 overflow-hidden">
            <div className="shrink-0 relative">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files..."
                aria-label="Search workspace files"
                className="w-full pl-8 pr-2.5 py-1 rounded-md bg-[#1A1A1E] border border-neutral-800 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600"
              />
            </div>

            <div
              data-testid="sidebar-file-explorer-scroll"
              className="flex-1 min-h-0 overflow-y-auto pr-0.5 space-y-0.5"
            >
              {filteredFiles.length > 0 ? (
                renderTreeNode(treeRoot, 0)
              ) : (
                <div className="py-4 px-2 text-center text-xs text-neutral-500">
                  No matching files found.
                </div>
              )}
            </div>
          </div>
        )}

        {explorerOpen && !isWorkspaceConnected && (
          <div className="px-3.5 pb-3 text-xs text-neutral-500">
            Connect a VS Code workspace or import a project to browse files.
          </div>
        )}
      </div>

      {/* 5. Recent Conversation List */}
      <div className="shrink-0 max-h-40 flex flex-col border-b border-neutral-800/60 overflow-hidden">
        <div className="px-3.5 pt-2.5 pb-1 text-[11px] font-medium text-neutral-500">
          Recent Conversations
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full px-2.5 py-1.5 rounded-md text-left flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-neutral-800 text-neutral-100 font-medium'
                    : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span className="truncate">{conv.title}</span>
                </span>
                <span className="text-[10px] font-mono text-neutral-500 tabular-nums shrink-0">
                  {conv.updatedAt}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 6. Small Settings Entry at the Bottom */}
      <div className="shrink-0 p-2.5">
        <button
          type="button"
          onClick={() => onOpenSettings('general')}
          className="w-full px-3 py-2 rounded-lg text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/70 flex items-center justify-between transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-neutral-400" />
            <span>Settings</span>
          </span>
          <span className="text-[11px] text-neutral-500">Models &amp; Advanced</span>
        </button>
      </div>
    </aside>
  );
};
