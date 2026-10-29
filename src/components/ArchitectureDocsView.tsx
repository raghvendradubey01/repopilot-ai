import React, { useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Download,
  Laptop,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import type { AIProviderInfo } from '../types/repopilot';

interface ArchitectureDocsViewProps {
  providers: AIProviderInfo[];
  isolatedSandboxAvailable: boolean;
  onDownloadVsCodeExtension?: () => Promise<void>;
  onInspectExtensionInEditor?: () => Promise<void>;
}

export const ArchitectureDocsView: React.FC<ArchitectureDocsViewProps> = ({
  providers,
  isolatedSandboxAvailable,
  onDownloadVsCodeExtension,
  onInspectExtensionInEditor,
}) => {
  const [testCommandInput, setTestCommandInput] = useState<string>('pytest -q');
  const [commandClassification, setCommandClassification] = useState<{
    command: string;
    riskLevel: string;
    requiresExplicitModalWarning: boolean;
    reason: string;
  } | null>({
    command: 'pytest -q',
    riskLevel: 'safe_test_or_check',
    requiresExplicitModalWarning: false,
    reason:
      'Recognized test/verification runner (Standard test / lint / typecheck runner). Still requires terminal confirmation if requireTerminalApproval is enabled.',
  });

  const handleClassifyCommand = async (cmdToTest?: string) => {
    const targetCmd = (cmdToTest ?? testCommandInput).trim();
    if (!targetCmd) return;
    setTestCommandInput(targetCmd);
    try {
      const res = await fetch('/api/local-workspace/classify-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: targetCmd }),
      });
      const data = await res.json();
      if (data.classification) {
        setCommandClassification(data.classification);
      }
    } catch {
      // Ignore transient error
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Section 0: Real VS Code Extension & Local Workspace Agent */}
      <section className="rounded-lg border border-sky-500/40 bg-[#0E131F] p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Laptop className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              00. Local VS Code Extension Architecture (`vscode-extension/`) &amp; Extension Development Host
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {onInspectExtensionInEditor && (
              <button
                type="button"
                onClick={() => onInspectExtensionInEditor()}
                className="px-3 py-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 transition-colors cursor-pointer"
              >
                Open Extension Code in Editor
              </button>
            )}
            {onDownloadVsCodeExtension && (
              <button
                type="button"
                onClick={() => onDownloadVsCodeExtension()}
                className="px-3 py-1.5 rounded-lg bg-sky-500 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download VS Code Extension (.zip)</span>
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          RepoPilot AI includes an installable Phase 1 VS Code extension in <code className="text-sky-300">/vscode-extension</code> that operates directly on the currently open VS Code workspace folder without requiring ZIP uploads. It uses <code className="text-sky-300">vscode.workspace.workspaceFolders</code>, a nested <code className="text-sky-300">vscode.TreeDataProvider</code> file explorer, filename &amp; text search tools, and validated webview message passing. <strong>Phase 1 Scope:</strong> Implements real workspace inspection and AI analysis only (automated code edits and terminal execution are not enabled yet in the extension).
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 flex flex-col gap-2">
            <span className="font-semibold text-slate-100">
              Windows Installation &amp; Testing Instructions (PowerShell / CMD)
            </span>
            <pre className="bg-[#070A10] border border-slate-800 rounded p-3 font-mono text-[11px] text-sky-300 overflow-x-auto">
{`# 1. Start the RepoPilot AI backend (PowerShell in project root)
npm install
npm run dev

# 2. Compile the VS Code extension (new PowerShell terminal)
cd vscode-extension
npm install
npm run compile

# 3. Open in VS Code on Windows & press F5
code .`}
            </pre>
            <span className="text-[11px] text-slate-400">
              Pressing <strong>F5</strong> launches an <strong>[Extension Development Host]</strong> window on Windows. Open any project via <strong>File &rarr; Open Folder... (Ctrl+K Ctrl+O)</strong> and run <code className="text-slate-300">RepoPilot AI: Inspect Current Workspace</code> or <code className="text-slate-300">RepoPilot AI: Analyze Active File</code> from <code className="text-slate-300">Ctrl+Shift+P</code>.
            </span>
          </div>

          {/* Interactive Terminal Command Risk Classifier */}
          <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                <span>Terminal Command Safety Gate (`classifyTerminalCommandRisk`)</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Never runs commands blindly
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={testCommandInput}
                onChange={(e) => setTestCommandInput(e.target.value)}
                aria-label="Test Terminal Command Classification"
                className="flex-1 rounded border border-slate-700 bg-[#0E131F] px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-sky-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleClassifyCommand()}
                className="px-3 py-1.5 rounded bg-sky-500 text-xs font-semibold text-slate-950 hover:bg-sky-400 cursor-pointer shrink-0"
              >
                Classify Risk
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => handleClassifyCommand('pytest -q')}
                className="px-2 py-0.5 rounded border border-slate-700 bg-slate-800/70 font-mono text-slate-300 hover:text-white cursor-pointer"
              >
                pytest -q
              </button>
              <button
                type="button"
                onClick={() => handleClassifyCommand('npm install lodash')}
                className="px-2 py-0.5 rounded border border-slate-700 bg-slate-800/70 font-mono text-amber-300 hover:text-white cursor-pointer"
              >
                npm install lodash
              </button>
              <button
                type="button"
                onClick={() => handleClassifyCommand('rm -rf /tmp/build && sudo reboot')}
                className="px-2 py-0.5 rounded border border-slate-700 bg-slate-800/70 font-mono text-rose-300 hover:text-white cursor-pointer"
              >
                rm -rf /tmp/build &amp;&amp; sudo reboot
              </button>
            </div>

            {commandClassification && (
              <div
                className={`rounded border p-2.5 font-mono text-[11px] flex items-start gap-2 ${
                  commandClassification.riskLevel === 'safe_test_or_check'
                    ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200'
                    : commandClassification.riskLevel ===
                      'blocked_or_high_risk_destructive'
                    ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
                    : 'border-amber-500/40 bg-amber-950/20 text-amber-200'
                }`}
              >
                {commandClassification.riskLevel === 'safe_test_or_check' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="flex flex-col gap-0.5">
                  <strong>
                    Risk Level: {commandClassification.riskLevel.toUpperCase()}
                  </strong>
                  <span className="font-sans">
                    {commandClassification.reason}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section 1: OpenAI-Compatible & Multi-Provider Abstraction */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131F] p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-sky-400" />
            <span>
              01. Multi-Provider AI Abstraction (Nebius Token Factory, NVIDIA Nemotron &amp; Gemini)
            </span>
          </h3>
          <span className="text-xs font-mono text-slate-400">
            src/server/aiProviders.ts · vscode.SecretStorage
          </span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          RepoPilot AI routes all LLM requests through a unified server-side provider interface or VS Code&apos;s OS keychain (`vscode.SecretStorage`). API keys are never placed in frontend code, `settings.json`, or source control.
        </p>

        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0B0F17] text-slate-400">
                <th className="py-2.5 px-3 font-medium">Provider</th>
                <th className="py-2.5 px-3 font-medium">Protocol</th>
                <th className="py-2.5 px-3 font-medium">Default Model</th>
                <th className="py-2.5 px-3 font-medium">Endpoint Base URL</th>
                <th className="py-2.5 px-3 font-medium">Server Env Key</th>
                <th className="py-2.5 px-3 font-medium">Server Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {providers.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-100">
                    {p.name}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">{p.protocol}</td>
                  <td className="py-2.5 px-3 text-sky-300">{p.defaultModel}</td>
                  <td className="py-2.5 px-3 text-slate-400 truncate max-w-[240px]">
                    {p.endpointUrl}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">{p.envVarName}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={
                        p.configuredOnServer
                          ? 'text-emerald-400'
                          : 'text-amber-300'
                      }
                    >
                      {p.configuredOnServer
                        ? 'Configured'
                        : `Missing ${p.envVarName} (Setup Required)`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: Security & Sandbox Isolation Policy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border border-slate-800 bg-[#0E131F] p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              02. Workspace Containment &amp; Secret Redaction
            </h3>
          </div>
          <ul className="text-xs text-slate-300 flex flex-col gap-2 leading-relaxed">
            <li>
              <strong className="text-slate-100">
                Active Workspace Boundary (`isPathInsideWorkspace`):
              </strong>{' '}
              Restricts all file reads and `vscode.WorkspaceEdit` operations to the active workspace root, blocking `..` traversal, absolute escapes, and `.git/` internals.
            </li>
            <li>
              <strong className="text-slate-100">
                Selective Context &amp; Privacy Disclosure:
              </strong>{' '}
              Excludes `node_modules`, `.git`, virtualenvs, build artifacts, and files &gt; 256 KB. Transmits only the minimal relevant file subset to the AI provider and discloses exact file/token counts.
            </li>
            <li>
              <strong className="text-slate-100">
                Secret &amp; Credential Redaction:
              </strong>{' '}
              Blocks `.env*`, private keys (`.pem`, `id_rsa`), and automatically scrubs OpenAI (`sk-...`), Google (`AIza...`), NVIDIA (`nvapi-...`), AWS (`AKIA...`), and GitHub (`ghp_...`) tokens from prompts and logs.
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-slate-800 bg-[#0E131F] p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Lock className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              03. Approval-Gated Execution &amp; Repair Loop
            </h3>
          </div>
          <ul className="text-xs text-slate-300 flex flex-col gap-2 leading-relaxed">
            <li>
              <strong className="text-slate-100">
                VS Code Terminal Approval Gate:
              </strong>{' '}
              In the VS Code extension, test and build commands are classified by `classifyTerminalCommandRisk()` and require explicit developer approval before running in the VS Code terminal.
            </li>
            <li>
              <strong className="text-slate-100">
                Web Server Isolation Policy:
              </strong>{' '}
              Current Host Sandbox Status:{' '}
              <span className="font-mono text-amber-300">
                {isolatedSandboxAvailable
                  ? 'ISOLATED CONTAINER CONNECTED'
                  : 'NO ISOLATED CONTAINER ON HOST (WEB SERVER NEVER EXECUTES UNTRUSTED CODE)'}
              </span>
              .
            </li>
            <li>
              <strong className="text-slate-100">
                Up-to-2 Autonomous Repairs:
              </strong>{' '}
              Collects real terminal test output and `vscode.languages.getDiagnostics()` errors, feeding them back to the model for up to 2 targeted repair iterations.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
};
