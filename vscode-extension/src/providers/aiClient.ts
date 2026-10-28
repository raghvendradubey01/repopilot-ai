import * as vscode from 'vscode';
import path from 'path';
import {
  buildContextPrivacyManifest,
  type ContextPrivacyManifest,
  redactWorkspaceSecrets,
} from '../core/workspaceSafety';
import {
  RepoPilotExtensionError,
  type WorkspaceDiagnosticItem,
  type WorkspaceFileEntry,
} from '../tools/workspaceTools';

export interface ActiveEditorSelectionContext {
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  selectedText: string;
}

export interface ProposedAnalysisDiffPreview {
  filePath: string;
  explanation: string;
  originalContent: string;
  proposedContent: string;
}

export interface AgentTurnResponse {
  summary: string;
  rootCause: string;
  rootCauseType: string;
  acceptanceCriteria: string[];
  inspectedFiles: string[];
  proposedEdits: ProposedAnalysisDiffPreview[];
  recommendedTestCommand: string;
  privacyManifest: ContextPrivacyManifest;
  clarifyingQuestion?: string | null;
}

export interface WorkspaceAIAnalysisRequest {
  workspaceName: string;
  providerId: string;
  modelId: string;
  selectedFiles: WorkspaceFileEntry[];
  totalWorkspaceFiles: number;
  diagnostics: WorkspaceDiagnosticItem[];
  selection: ActiveEditorSelectionContext | null;
  taskPrompt: string;
  actionType: string;
  tokenBudget: number;
  privacyManifest: ContextPrivacyManifest;
}

/**
 * Typed AI Model Provider Interface so RepoPilot AI is never hardcoded to a single vendor.
 * Implementations can either reuse the RepoPilot AI backend or query Gemini / OpenAI-compatible APIs directly.
 */
export interface AIModelProvider {
  readonly id: string;
  analyzeWorkspaceTask(
    request: WorkspaceAIAnalysisRequest
  ): Promise<AgentTurnResponse>;
}

/**
 * Selects only the most relevant workspace files within the token budget
 * so the extension never uploads the user's entire repository.
 */
export function selectRelevantWorkspaceContext(
  allFiles: WorkspaceFileEntry[],
  taskPrompt: string,
  diagnostics: WorkspaceDiagnosticItem[],
  selection: ActiveEditorSelectionContext | null,
  tokenBudget = 8000
): {
  selectedFiles: WorkspaceFileEntry[];
  transmittedSummary: Array<{
    relativePath: string;
    mode: 'full' | 'excerpt';
    estimatedTokens: number;
  }>;
} {
  const promptLower = taskPrompt.toLowerCase();
  const diagFiles = new Set(diagnostics.map((d) => d.filePath));

  const scored = allFiles.map((file) => {
    let score = 0;
    if (selection && selection.filePath === file.path) score += 100;
    if (diagFiles.has(file.path)) score += 60;
    if (promptLower.includes(file.path.toLowerCase())) score += 50;
    const base = path.basename(file.path).toLowerCase();
    if (promptLower.includes(base)) score += 35;
    if (
      /^(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|tsconfig\.json)$/i.test(
        base
      )
    ) {
      score += 20;
    }
    if (!file.isTestFile) score += 10;
    return { file, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const selectedFiles: WorkspaceFileEntry[] = [];
  const transmittedSummary: Array<{
    relativePath: string;
    mode: 'full' | 'excerpt';
    estimatedTokens: number;
  }> = [];
  let usedTokens = 0;

  for (const { file } of scored) {
    const estTokens = Math.max(1, Math.ceil(file.content.length / 4));
    if (usedTokens + estTokens <= tokenBudget || selectedFiles.length < 2) {
      selectedFiles.push(file);
      transmittedSummary.push({
        relativePath: file.path,
        mode: 'full',
        estimatedTokens: estTokens,
      });
      usedTokens += estTokens;
    } else if (usedTokens < tokenBudget) {
      const remainingChars = Math.max(800, (tokenBudget - usedTokens) * 4);
      const excerptContent =
        file.content.slice(0, remainingChars) +
        '\n// ... [Truncated to respect local context token budget]';
      const excerptTokens = Math.ceil(excerptContent.length / 4);
      selectedFiles.push({
        ...file,
        content: excerptContent,
      });
      transmittedSummary.push({
        relativePath: file.path,
        mode: 'excerpt',
        estimatedTokens: excerptTokens,
      });
      usedTokens += excerptTokens;
      break;
    }
  }

  return { selectedFiles, transmittedSummary };
}

/**
 * Provider Implementation 1: Reuses the existing RepoPilot AI Node.js backend (`/api/vscode/agent-turn`).
 */
export class RepoPilotBackendProvider implements AIModelProvider {
  public readonly id = 'repopilot-backend';

  constructor(private readonly backendUrl: string) {}

  public async analyzeWorkspaceTask(
    request: WorkspaceAIAnalysisRequest
  ): Promise<AgentTurnResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.backendUrl}/api/vscode/agent-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: request.providerId,
          customModel: request.modelId,
          workspaceName: request.workspaceName,
          files: request.selectedFiles,
          totalWorkspaceFiles: request.totalWorkspaceFiles,
          diagnostics: request.diagnostics,
          selectionContext: request.selection,
          taskDescription: request.taskPrompt,
          actionType: request.actionType,
          contextTokenBudget: request.tokenBudget,
        }),
      });
    } catch (err) {
      throw new RepoPilotExtensionError(
        'API_ERROR',
        `Could not connect to RepoPilot AI backend at ${this.backendUrl}. Make sure the server is running (npm run dev) or switch "repopilot.connectionMode" to "direct-provider". (${
          err instanceof Error ? err.message : String(err)
        })`
      );
    }

    if (!response.ok) {
      const errBody = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      const errText =
        errBody.error ||
        `RepoPilot AI backend returned HTTP ${response.status} from ${this.backendUrl}`;

      if (
        response.status === 401 ||
        response.status === 403 ||
        /api key|credential|secret|unconfigured/i.test(errText)
      ) {
        throw new RepoPilotExtensionError('MISSING_CREDENTIALS', errText);
      }

      throw new RepoPilotExtensionError('API_ERROR', errText);
    }

    const data = (await response.json()) as {
      patchBundle: {
        plan: {
          summary: string;
          rootCause: string;
          rootCauseType?: string;
          acceptanceCriteria?: string[];
          inspectedFiles?: string[];
          affectedFiles: string[];
          testsToRun?: { full_suite_command?: string };
        };
        changes: Array<{
          filePath: string;
          explanation: string;
          originalContent: string;
          proposedContent: string;
        }>;
        clarifyingQuestion?: string | null;
      };
    };

    const bundle = data.patchBundle;
    return {
      summary: bundle.plan.summary,
      rootCause: bundle.plan.rootCause,
      rootCauseType: bundle.plan.rootCauseType || 'CONFIRMED',
      acceptanceCriteria: bundle.plan.acceptanceCriteria || [],
      inspectedFiles: bundle.plan.inspectedFiles || bundle.plan.affectedFiles,
      proposedEdits: bundle.changes.map((c) => ({
        filePath: c.filePath,
        explanation: c.explanation,
        originalContent: c.originalContent,
        proposedContent: c.proposedContent,
      })),
      recommendedTestCommand:
        bundle.plan.testsToRun?.full_suite_command || 'pytest -q',
      privacyManifest: request.privacyManifest,
      clarifyingQuestion: bundle.clarifyingQuestion,
    };
  }
}

/**
 * Provider Implementation 2: Queries Gemini or OpenAI-compatible endpoints (Nebius Token Factory, NVIDIA Nemotron)
 * directly from the VS Code Extension Host using API keys stored in `vscode.SecretStorage`.
 */
export class DirectConfiguredModelProvider implements AIModelProvider {
  public readonly id = 'direct-provider';

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly openaiBaseUrl: string
  ) {}

  public async analyzeWorkspaceTask(
    request: WorkspaceAIAnalysisRequest
  ): Promise<AgentTurnResponse> {
    const apiKey = (await this.secrets.get('repopilot.apiKey'))?.trim();
    if (!apiKey) {
      throw new RepoPilotExtensionError(
        'MISSING_CREDENTIALS',
        'Missing API key in VS Code SecretStorage. Run "RepoPilot AI: Set Provider API Key in VS Code SecretStorage" from the Command Palette (Ctrl+Shift+P) or switch "repopilot.connectionMode" to "repopilot-backend".'
      );
    }

    const filesBlock = request.selectedFiles
      .map(
        (f) =>
          `--- FILE: ${f.path} (${f.language}) ---\n${redactWorkspaceSecrets(
            f.content
          )}`
      )
      .join('\n\n');

    const systemPrompt = [
      'You are RepoPilot AI (Phase 1 Read-Only Workspace Inspector & Analyzer).',
      'Analyze the provided VS Code workspace files and user task.',
      'Return ONLY a valid JSON object with keys:',
      '{"summary": string, "rootCause": string, "rootCauseType": "CONFIRMED" | "HYPOTHESIS", "acceptanceCriteria": string[], "inspectedFiles": string[], "proposedEdits": [{"filePath": string, "explanation": string, "originalContent": string, "proposedContent": string}], "recommendedTestCommand": string}',
    ].join(' ');

    const userPrompt = `Workspace: ${request.workspaceName}\nTask: ${request.taskPrompt}\n\nRelevant Workspace Files:\n${filesBlock}`;

    let rawJsonText = '';

    if (request.providerId === 'gemini') {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        request.modelId
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      }).catch((err) => {
        throw new RepoPilotExtensionError(
          'API_ERROR',
          `Network error calling Gemini API: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new RepoPilotExtensionError(
          res.status === 401 || res.status === 403
            ? 'MISSING_CREDENTIALS'
            : 'API_ERROR',
          `Gemini API returned HTTP ${res.status}: ${errText.slice(0, 240)}`
        );
      }

      const payload = (await res.json()) as any;
      rawJsonText =
        payload?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    } else {
      const baseUrl = this.openaiBaseUrl.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: request.modelId,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      }).catch((err) => {
        throw new RepoPilotExtensionError(
          'API_ERROR',
          `Network error calling OpenAI-compatible endpoint (${baseUrl}): ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new RepoPilotExtensionError(
          res.status === 401 || res.status === 403
            ? 'MISSING_CREDENTIALS'
            : 'API_ERROR',
          `Provider endpoint returned HTTP ${res.status}: ${errText.slice(
            0,
            240
          )}`
        );
      }

      const payload = (await res.json()) as any;
      rawJsonText = payload?.choices?.[0]?.message?.content || '{}';
    }

    try {
      const parsed = JSON.parse(rawJsonText);
      return {
        summary: String(parsed.summary || 'Workspace analysis completed.'),
        rootCause: String(parsed.rootCause || 'Analysis complete.'),
        rootCauseType:
          parsed.rootCauseType === 'HYPOTHESIS' ? 'HYPOTHESIS' : 'CONFIRMED',
        acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria)
          ? parsed.acceptanceCriteria.map(String)
          : [],
        inspectedFiles: Array.isArray(parsed.inspectedFiles)
          ? parsed.inspectedFiles.map(String)
          : request.selectedFiles.map((f) => f.path),
        proposedEdits: Array.isArray(parsed.proposedEdits)
          ? parsed.proposedEdits.map((e: any) => ({
              filePath: String(e.filePath || ''),
              explanation: String(e.explanation || ''),
              originalContent: String(e.originalContent || ''),
              proposedContent: String(e.proposedContent || ''),
            }))
          : [],
        recommendedTestCommand: String(
          parsed.recommendedTestCommand || 'pytest -q'
        ),
        privacyManifest: request.privacyManifest,
      };
    } catch (err) {
      throw new RepoPilotExtensionError(
        'API_ERROR',
        `Provider returned malformed JSON response: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
}

/**
 * Factory that resolves the configured `AIModelProvider` instance.
 */
export function resolveConfiguredAIProvider(
  context: vscode.ExtensionContext
): {
  provider: AIModelProvider;
  endpointLabel: string;
  providerId: string;
  modelId: string;
  tokenBudget: number;
} {
  const config = vscode.workspace.getConfiguration('repopilot');
  const connectionMode =
    config.get<string>('connectionMode') || 'repopilot-backend';
  const backendUrl = (
    config.get<string>('backendUrl') || 'http://localhost:3000'
  ).replace(/\/+$/, '');
  const providerId = config.get<string>('provider') || 'gemini';
  const modelId = config.get<string>('model') || 'gemini-3-flash-preview';
  const tokenBudget = config.get<number>('contextTokenBudget') || 8000;
  const openaiBaseUrl =
    config.get<string>('openaiCompatibleBaseUrl') ||
    'https://api.studio.nebius.ai/v1';

  if (connectionMode === 'direct-provider') {
    return {
      provider: new DirectConfiguredModelProvider(
        context.secrets,
        openaiBaseUrl
      ),
      endpointLabel:
        providerId === 'gemini'
          ? 'https://generativelanguage.googleapis.com'
          : openaiBaseUrl,
      providerId,
      modelId,
      tokenBudget,
    };
  }

  return {
    provider: new RepoPilotBackendProvider(backendUrl),
    endpointLabel: `${backendUrl}/api/vscode/agent-turn`,
    providerId,
    modelId,
    tokenBudget,
  };
}

/**
 * Executes a Phase 1 read-only AI workspace analysis turn.
 * Keeps API keys exclusively in VS Code SecretStorage or on the RepoPilot AI backend.
 */
export async function runWorkspaceAgentTurn(params: {
  context: vscode.ExtensionContext;
  workspaceRoot: string;
  allFiles: WorkspaceFileEntry[];
  diagnostics: WorkspaceDiagnosticItem[];
  selection: ActiveEditorSelectionContext | null;
  taskPrompt: string;
  actionType?: string;
}): Promise<AgentTurnResponse> {
  const { provider, endpointLabel, providerId, modelId, tokenBudget } =
    resolveConfiguredAIProvider(params.context);

  const { selectedFiles, transmittedSummary } = selectRelevantWorkspaceContext(
    params.allFiles,
    params.taskPrompt,
    params.diagnostics,
    params.selection,
    tokenBudget
  );

  const privacyManifest = buildContextPrivacyManifest({
    workspaceRootName: path.basename(params.workspaceRoot),
    providerId,
    modelId,
    endpointUrl: endpointLabel,
    totalWorkspaceFiles: params.allFiles.length,
    filesTransmitted: transmittedSummary,
  });

  let augmentedTask = params.taskPrompt;
  if (params.diagnostics.length > 0) {
    const diagSummary = params.diagnostics
      .slice(0, 10)
      .map(
        (d) =>
          `[${d.severity.toUpperCase()}] ${d.filePath}:${d.line}:${d.column} - ${d.message}`
      )
      .join('\n');
    augmentedTask += `\n\nActive VS Code Workspace Diagnostics:\n${diagSummary}`;
  }

  return provider.analyzeWorkspaceTask({
    workspaceName: path.basename(params.workspaceRoot),
    providerId,
    modelId,
    selectedFiles,
    totalWorkspaceFiles: params.allFiles.length,
    diagnostics: params.diagnostics,
    selection: params.selection,
    taskPrompt: augmentedTask,
    actionType: params.actionType || 'custom',
    tokenBudget,
    privacyManifest,
  });
}
