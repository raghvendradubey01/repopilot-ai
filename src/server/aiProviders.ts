import { GoogleGenAI, Type } from '@google/genai';
import type {
  AgentDiagnosticsReport,
  AIAnalysisPlan,
  AIProviderId,
  AIProviderInfo,
  CodeSelectionContext,
  FilePatchChange,
  QuickAgentActionType,
  RepoFile,
  StructuredAgentOutput,
  VerificationStatus,
} from '../types/repopilot';
import {
  analyzeRepositoryStructure,
  selectContextForTask,
} from '../utils/repoAnalyzer';
import { validateProposedPatches } from '../utils/patchValidator';
import { executeModelQueryWithOneRetry } from '../utils/responseValidator';
import {
  buildDeterministicStructuredOutput,
  convertStructuredOutputToLegacyPlanAndChanges,
  detectAmbiguousTask,
  detectNoChangeNeededTask,
} from '../utils/sampleRepos';
import { redactSecrets } from '../utils/securityValidator';

function isValidKey(val: string | undefined): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  return (
    trimmed.length > 8 &&
    trimmed !== 'MY_GEMINI_API_KEY' &&
    !trimmed.startsWith('YOUR_')
  );
}

export function getServerAIProviders(): AIProviderInfo[] {
  return [
    {
      id: 'gemini',
      name: 'Google Gemini (Server SDK)',
      vendor: 'Google DeepMind',
      protocol: 'google-genai-sdk',
      defaultModel: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
      supportedModels: [
        'gemini-3-flash-preview',
        'gemini-3.1-pro-preview',
        'gemini-2.5-flash',
      ],
      endpointUrl: 'https://generativelanguage.googleapis.com (Server SDK)',
      configuredOnServer: isValidKey(process.env.GEMINI_API_KEY),
      envVarName: 'GEMINI_API_KEY',
      description:
        'Primary server-side reasoning model via @google/genai SDK with structured JSON schema output.',
    },
    {
      id: 'nebius',
      name: 'Nebius Token Factory',
      vendor: 'Nebius AI Studio',
      protocol: 'openai-compatible',
      defaultModel:
        process.env.NEBIUS_MODEL || 'Qwen/Qwen2.5-Coder-32B-Instruct',
      supportedModels: [
        'Qwen/Qwen2.5-Coder-32B-Instruct',
        'deepseek-ai/DeepSeek-V3',
        'meta-llama/Llama-3.3-70B-Instruct',
      ],
      endpointUrl:
        process.env.NEBIUS_BASE_URL || 'https://api.studio.nebius.ai/v1',
      configuredOnServer: isValidKey(process.env.NEBIUS_API_KEY),
      envVarName: 'NEBIUS_API_KEY',
      description:
        'OpenAI-compatible chat completions adapter for Nebius Token Factory coding models.',
    },
    {
      id: 'nvidia',
      name: 'NVIDIA Nemotron (NIM)',
      vendor: 'NVIDIA',
      protocol: 'openai-compatible',
      defaultModel:
        process.env.NVIDIA_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct',
      supportedModels: [
        'nvidia/llama-3.1-nemotron-70b-instruct',
        'meta/llama-3.1-70b-instruct',
      ],
      endpointUrl:
        process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      configuredOnServer: isValidKey(process.env.NVIDIA_API_KEY),
      envVarName: 'NVIDIA_API_KEY',
      description:
        'OpenAI-compatible adapter for NVIDIA NIM & Nemotron reasoning endpoints.',
    },
    {
      id: 'custom',
      name: 'Custom OpenAI-Compatible API',
      vendor: 'Configurable Endpoint',
      protocol: 'openai-compatible',
      defaultModel: process.env.OPENAI_COMPAT_MODEL || 'gpt-4o-mini',
      supportedModels: ['gpt-4o-mini', 'gpt-4o', 'claude-3-5-sonnet'],
      endpointUrl:
        process.env.OPENAI_COMPAT_BASE_URL || 'https://api.openai.com/v1',
      configuredOnServer:
        isValidKey(process.env.OPENAI_COMPAT_API_KEY) &&
        Boolean(process.env.OPENAI_COMPAT_BASE_URL),
      envVarName: 'OPENAI_COMPAT_API_KEY',
      description:
        'Generic OpenAI-compatible v1/chat/completions adapter for self-hosted vLLM, Ollama, or OpenRouter.',
    },
  ];
}

export function getKnownServerSecrets(): (string | undefined)[] {
  return [
    process.env.GEMINI_API_KEY,
    process.env.NEBIUS_API_KEY,
    process.env.NVIDIA_API_KEY,
    process.env.OPENAI_COMPAT_API_KEY,
    process.env.GITHUB_TOKEN,
  ];
}

function buildSystemPrompt(
  validFilePaths: string[],
  primaryLanguage: string,
  actionType?: QuickAgentActionType
): string {
  return [
    `You are RepoPilot AI, an accuracy-focused autonomous ${primaryLanguage} software engineering agent.`,
    actionType ? `ACTIVE WORKSPACE ACTION: ${actionType}` : '',
    'STRICT ENGINEERING RULES:',
    '1. Never invent file names, functions, classes, or APIs that do not exist in the repository.',
    `2. Valid repository file paths are strictly: ${validFilePaths.join(', ')}`,
    '3. Inspect relevant source files, imports, callers, dependencies, configuration, and existing tests before proposing a fix.',
    '4. Identify the root cause and explicit acceptance criteria before editing.',
    '5. Prefer minimal, surgical changes (search_replace_blocks) over rewriting whole files unnecessarily. Preserve existing coding style, imports, and public interfaces.',
    '6. If the user task is ambiguous or underspecified, set root_cause.type = "AMBIGUOUS_TASK", provide a specific clarifying_question, set files_to_change = [], proposed_patch = [], and verification_status = "NEEDS_REVIEW".',
    '7. If the requested behavior is already implemented in the repository (or action is explain-code / find-bug), set root_cause.type = "NONE_NO_CHANGE_NEEDED", files_to_change = [], and proposed_patch = [].',
    '8. Distinguish CONFIRMED root causes (backed by exact file/line evidence) from HYPOTHESIS.',
    '9. Always set initial verification_status to "NOT_VERIFIED" (or "NEEDS_REVIEW" if ambiguous) because tests have not been executed yet.',
    '10. Return ONLY a valid JSON object with these exact keys:',
    '   - task_summary (string)',
    '   - acceptance_criteria (string[])',
    '   - repository_findings ({ language, dependencies, entry_points, relevant_files, existing_tests, caller_relationships })',
    '   - root_cause ({ type: "CONFIRMED" | "HYPOTHESIS" | "NONE_NO_CHANGE_NEEDED" | "AMBIGUOUS_TASK", description, evidence_files })',
    '   - clarifying_question (string | null)',
    '   - files_to_change (string[])',
    '   - proposed_patch (Array of { file_path, operation: "modify" | "no_change", explanation, search_replace_blocks: [{ search, replace }], patched_content })',
    '   - tests_to_run ({ targeted_tests: string[], full_suite_command: string })',
    '   - verification_status ("NOT_VERIFIED" | "NEEDS_REVIEW" | "FAILED" | "PARTIALLY_VERIFIED" | "VERIFIED")',
    '   - remaining_risks (string[])',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildUserPromptFromContext(params: {
  taskDescription: string;
  actionType?: QuickAgentActionType;
  selectionContext?: CodeSelectionContext | null;
  allFilePaths: string[];
  findingsSummary: string;
  contextSelections: Array<{
    path: string;
    mode: 'full' | 'excerpt';
    reason: string;
    contentSent: string;
    truncationWarning?: string;
  }>;
  failureContext?: string;
  previousRepairHistory?: string[];
  correctionPrompt?: string;
}): string {
  const sections: string[] = [
    `TASK REQUEST${params.actionType ? ` [Action: ${params.actionType}]` : ''}:\n${params.taskDescription}`,
  ];

  if (params.selectionContext) {
    sections.push(
      `USER SELECTED CODE IN EDITOR (${params.selectionContext.filePath}, lines ${params.selectionContext.startLine}-${params.selectionContext.endLine}):\n\`\`\`${params.selectionContext.language}\n${params.selectionContext.selectedText}\n\`\`\``
    );
  }

  sections.push(
    `COMPLETE REPOSITORY FILE TREE:\n${params.allFilePaths.map((p) => `- ${p}`).join('\n')}`,
    `REPOSITORY FINDINGS, TOOLCHAIN & CALLER GRAPH:\n${params.findingsSummary}`,
    `SELECTED CONTEXT FILES:\n${params.contextSelections
      .map(
        (c) =>
          `=== FILE: ${c.path} [mode=${c.mode}, reason=${c.reason}${
            c.truncationWarning ? `, WARNING=${c.truncationWarning}` : ''
          }] ===\n${c.contentSent}\n=== END FILE: ${c.path} ===`
      )
      .join('\n\n')}`
  );

  if (params.previousRepairHistory && params.previousRepairHistory.length > 0) {
    sections.push(
      `PREVIOUS REPAIR ATTEMPTS HISTORY:\n${params.previousRepairHistory.join('\n---\n')}`
    );
  }

  if (params.failureContext) {
    sections.push(
      `ACTUAL TEST / STATIC CHECK FAILURE OUTPUT & STACK TRACE TO REPAIR:\n${params.failureContext}\n\nInspect the exact error message, failing test, and stack trace above. Provide a minimal, surgical repair patch that fixes the failure without breaking existing tests.`
    );
  }

  if (params.correctionPrompt) {
    sections.push(`SCHEMA CORRECTION REQUEST:\n${params.correctionPrompt}`);
  }

  return sections.join('\n\n');
}

export async function callOpenAICompatibleProvider(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const normalizedUrl = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(normalizedUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      const statusLabel =
        response.status === 429
          ? 'Rate limit exceeded (429)'
          : response.status === 401 || response.status === 403
          ? `Authentication failed (${response.status})`
          : response.status === 404
          ? `Model "${model}" or endpoint not found (404)`
          : `HTTP ${response.status}`;
      throw new Error(
        `OpenAI-compatible provider ${statusLabel}: ${redactSecrets(
          errText.slice(0, 400),
          getKnownServerSecrets()
        )}`
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content || !content.trim()) {
      throw new Error(
        'OpenAI-compatible provider returned an empty response body.'
      );
    }
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGeminiProvider(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Ensure a valid Gemini model alias is used if an outdated model name was passed
  const resolvedModel =
    model === 'gemini-3.8-flash' ? 'gemini-3-flash-preview' : model;

  const response = await ai.models.generateContent({
    model: resolvedModel,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          task_summary: { type: Type.STRING },
          acceptance_criteria: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          repository_findings: {
            type: Type.OBJECT,
            properties: {
              language: { type: Type.STRING },
              dependencies: { type: Type.ARRAY, items: { type: Type.STRING } },
              entry_points: { type: Type.ARRAY, items: { type: Type.STRING } },
              relevant_files: { type: Type.ARRAY, items: { type: Type.STRING } },
              existing_tests: { type: Type.ARRAY, items: { type: Type.STRING } },
              caller_relationships: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'language',
              'dependencies',
              'entry_points',
              'relevant_files',
              'existing_tests',
              'caller_relationships',
            ],
          },
          root_cause: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              description: { type: Type.STRING },
              evidence_files: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['type', 'description', 'evidence_files'],
          },
          clarifying_question: { type: Type.STRING, nullable: true },
          files_to_change: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          proposed_patch: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                file_path: { type: Type.STRING },
                operation: { type: Type.STRING },
                explanation: { type: Type.STRING },
                search_replace_blocks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      search: { type: Type.STRING },
                      replace: { type: Type.STRING },
                    },
                    required: ['search', 'replace'],
                  },
                },
                patched_content: { type: Type.STRING },
              },
              required: ['file_path', 'operation', 'explanation'],
            },
          },
          tests_to_run: {
            type: Type.OBJECT,
            properties: {
              targeted_tests: { type: Type.ARRAY, items: { type: Type.STRING } },
              full_suite_command: { type: Type.STRING },
            },
            required: ['targeted_tests', 'full_suite_command'],
          },
          verification_status: { type: Type.STRING },
          remaining_risks: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: [
          'task_summary',
          'acceptance_criteria',
          'repository_findings',
          'root_cause',
          'files_to_change',
          'proposed_patch',
          'tests_to_run',
          'verification_status',
          'remaining_risks',
        ],
      },
    },
  });

  if (!response.text) {
    throw new Error('Gemini returned an empty response.');
  }
  return response.text;
}

export async function generateAnalysisAndPatch(params: {
  providerId: AIProviderId;
  customModel?: string;
  repoId: string;
  files: RepoFile[];
  taskDescription: string;
  actionType?: QuickAgentActionType;
  selectionContext?: CodeSelectionContext | null;
  contextTokenBudget?: number;
  stage?: 'initial' | 'repair_1';
  failureContext?: string;
  previousRepairHistory?: string[];
}): Promise<{
  structuredOutput: StructuredAgentOutput;
  plan: AIAnalysisPlan;
  changes: FilePatchChange[];
  diagnostics: AgentDiagnosticsReport;
  patchValidationPassed: boolean;
  verificationStatus: VerificationStatus;
  repairNotes?: string;
}> {
  const providers = getServerAIProviders();
  const selected =
    providers.find((p) => p.id === params.providerId) || providers[0];
  const modelToUse = params.customModel?.trim() || selected.defaultModel;
  const maxBudget = params.contextTokenBudget ?? 8000;

  // Step 1: Build complete repository index, toolchain profile, and token-budgeted context selection
  const { findings, toolchain } = analyzeRepositoryStructure(params.files);
  const contextReport = selectContextForTask(
    params.files,
    params.taskDescription,
    maxBudget,
    params.selectionContext
  );

  const allFilePaths = params.files.map((f) => f.path);
  const systemPrompt = buildSystemPrompt(
    allFilePaths,
    toolchain.primaryLanguage,
    params.actionType
  );

  const triggerTwoStepDemo =
    params.taskDescription.toLowerCase().includes('triggers 1-retry') ||
    params.taskDescription.toLowerCase().includes('boundary first');

  const preCheckAmbiguous = detectAmbiguousTask(
    params.taskDescription,
    params.files,
    params.actionType
  );
  const preCheckNoChange = detectNoChangeNeededTask(
    params.taskDescription,
    params.files,
    params.actionType
  );

  let structuredOutput: StructuredAgentOutput | undefined;
  let schemaRetryTriggered = false;
  const responseValidationErrors: string[] = [];
  let activeProviderLabel = selected.name;
  let activeModelLabel = modelToUse;

  if (
    triggerTwoStepDemo ||
    preCheckAmbiguous.isAmbiguous ||
    preCheckNoChange.isNoChange
  ) {
    structuredOutput = buildDeterministicStructuredOutput(
      params.repoId,
      params.files,
      params.taskDescription,
      params.stage || 'initial',
      params.actionType,
      params.selectionContext
    );
  } else {
    const canCallSelected =
      (selected.id === 'gemini' && isValidKey(process.env.GEMINI_API_KEY)) ||
      (selected.id === 'nebius' && isValidKey(process.env.NEBIUS_API_KEY)) ||
      (selected.id === 'nvidia' && isValidKey(process.env.NVIDIA_API_KEY)) ||
      (selected.id === 'custom' &&
        isValidKey(process.env.OPENAI_COMPAT_API_KEY) &&
        Boolean(process.env.OPENAI_COMPAT_BASE_URL));
    const canCallGeminiFallback = isValidKey(process.env.GEMINI_API_KEY);

    if (canCallSelected || canCallGeminiFallback) {
      try {
        const invokeFn = async (correctionPrompt?: string) => {
          const userPrompt = buildUserPromptFromContext({
            taskDescription: params.taskDescription,
            actionType: params.actionType,
            selectionContext: params.selectionContext,
            allFilePaths,
            findingsSummary: JSON.stringify(findings, null, 2),
            contextSelections: contextReport.includedFiles,
            failureContext: params.failureContext,
            previousRepairHistory: params.previousRepairHistory,
            correctionPrompt,
          });

          if (
            selected.id === 'gemini' &&
            isValidKey(process.env.GEMINI_API_KEY)
          ) {
            return callGeminiProvider(
              process.env.GEMINI_API_KEY!,
              modelToUse,
              systemPrompt,
              userPrompt
            );
          }
          if (
            selected.id === 'nebius' &&
            isValidKey(process.env.NEBIUS_API_KEY)
          ) {
            return callOpenAICompatibleProvider(
              selected.endpointUrl,
              process.env.NEBIUS_API_KEY!,
              modelToUse,
              systemPrompt,
              userPrompt
            );
          }
          if (
            selected.id === 'nvidia' &&
            isValidKey(process.env.NVIDIA_API_KEY)
          ) {
            return callOpenAICompatibleProvider(
              selected.endpointUrl,
              process.env.NVIDIA_API_KEY!,
              modelToUse,
              systemPrompt,
              userPrompt
            );
          }
          if (
            selected.id === 'custom' &&
            isValidKey(process.env.OPENAI_COMPAT_API_KEY) &&
            process.env.OPENAI_COMPAT_BASE_URL
          ) {
            return callOpenAICompatibleProvider(
              process.env.OPENAI_COMPAT_BASE_URL,
              process.env.OPENAI_COMPAT_API_KEY!,
              modelToUse,
              systemPrompt,
              userPrompt
            );
          }
          activeProviderLabel = `${selected.name} (via Server Gemini Fallback)`;
          activeModelLabel = 'gemini-3-flash-preview';
          return callGeminiProvider(
            process.env.GEMINI_API_KEY!,
            'gemini-3-flash-preview',
            systemPrompt,
            userPrompt
          );
        };

        const queryResult = await executeModelQueryWithOneRetry(
          invokeFn,
          params.files
        );
        schemaRetryTriggered = queryResult.retryTriggered;
        responseValidationErrors.push(...queryResult.validationErrors);

        if (queryResult.success && queryResult.output) {
          // Verify that the model's proposed patches actually apply cleanly before accepting
          const preCheckPatch = validateProposedPatches(
            params.files,
            queryResult.output.proposed_patch
          );
          if (preCheckPatch.allValid) {
            structuredOutput = queryResult.output;
          } else {
            responseValidationErrors.push(
              ...preCheckPatch.errors.map(
                (e) => `[Model Patch Validation Failed] ${e}`
              )
            );
          }
        }
      } catch (err) {
        responseValidationErrors.push(
          redactSecrets(
            err instanceof Error ? err.message : String(err),
            getKnownServerSecrets()
          )
        );
      }
    }

    if (!structuredOutput) {
      activeProviderLabel = `${selected.name} (Deterministic Static Analyzer)`;
      structuredOutput = buildDeterministicStructuredOutput(
        params.repoId,
        params.files,
        params.taskDescription,
        params.stage || 'initial',
        params.actionType,
        params.selectionContext
      );
    }
  }

  // Step 2: Validate that all proposed patches target real files, apply cleanly, and pass static syntax/import checks
  const patchValidation = validateProposedPatches(
    params.files,
    structuredOutput.proposed_patch
  );

  // Never claim VERIFIED before running tests
  let computedStatus: VerificationStatus = 'NOT_VERIFIED';
  if (
    structuredOutput.root_cause.type === 'AMBIGUOUS_TASK' ||
    Boolean(structuredOutput.clarifying_question)
  ) {
    computedStatus = 'NEEDS_REVIEW';
  } else if (!patchValidation.allValid) {
    computedStatus = 'FAILED';
  }

  structuredOutput.verification_status = computedStatus;

  const inspectedFilePaths = contextReport.includedFiles.map((f) => f.path);
  const { plan } = convertStructuredOutputToLegacyPlanAndChanges(
    structuredOutput,
    params.files,
    activeProviderLabel,
    activeModelLabel,
    inspectedFilePaths
  );

  const sanitizedChanges: FilePatchChange[] = patchValidation.changes.map(
    (c) => ({
      ...c,
      explanation: redactSecrets(c.explanation, getKnownServerSecrets()),
      proposedContent: redactSecrets(
        c.proposedContent,
        getKnownServerSecrets()
      ),
    })
  );

  const defaultTargetedCmd =
    toolchain.primaryLanguage === 'TypeScript' ||
    toolchain.primaryLanguage === 'JavaScript'
      ? structuredOutput.tests_to_run.targeted_tests.length > 0
        ? `npx tsx --test ${structuredOutput.tests_to_run.targeted_tests.join(' ')}`
        : toolchain.recommendedTestCommand
      : structuredOutput.tests_to_run.targeted_tests.length > 0
      ? `pytest ${structuredOutput.tests_to_run.targeted_tests.join(' ')}`
      : toolchain.recommendedTestCommand;

  const diagnostics: AgentDiagnosticsReport = {
    providerId: selected.id,
    providerName: activeProviderLabel,
    modelIdentifier: activeModelLabel,
    timestamp: new Date().toISOString(),
    contextReport,
    toolchainProfile: toolchain,
    schemaValidationRetryTriggered: schemaRetryTriggered,
    responseValidationErrors,
    patchValidationDiagnostics: patchValidation.diagnostics,
    patchApplicationErrors: patchValidation.errors,
    targetedTestCommand: defaultTargetedCmd,
    fullSuiteTestCommand:
      structuredOutput.tests_to_run.full_suite_command ||
      toolchain.recommendedTestCommand,
    actualTestOutputs: [],
    repairAttemptsCount: params.stage === 'repair_1' ? 1 : 0,
    finalVerificationStatus: computedStatus,
    testOutcome: 'NOT_VERIFIED',
  };

  return {
    structuredOutput,
    plan,
    changes: sanitizedChanges,
    diagnostics,
    patchValidationPassed: patchValidation.allValid,
    verificationStatus: computedStatus,
    repairNotes: params.failureContext
      ? `Analyzed failure output and updated ${
          sanitizedChanges.map((c) => c.filePath).join(', ') || 'patch'
        }.`
      : undefined,
  };
}
