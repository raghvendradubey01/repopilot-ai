export type AIProviderId = 'gemini' | 'nebius' | 'nvidia' | 'custom';

export interface AIProviderInfo {
  id: AIProviderId;
  name: string;
  vendor: string;
  protocol: 'google-genai-sdk' | 'openai-compatible';
  defaultModel: string;
  supportedModels?: string[];
  endpointUrl: string;
  configuredOnServer: boolean;
  envVarName: string;
  description: string;
}

export type SupportedLanguage =
  | 'python'
  | 'typescript'
  | 'javascript'
  | 'java'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'php'
  | 'ruby'
  | 'swift'
  | 'kotlin'
  | 'sql'
  | 'html'
  | 'css'
  | 'json'
  | 'yaml'
  | 'toml'
  | 'markdown'
  | 'shell'
  | 'config'
  | 'text';

export interface RepoFile {
  path: string;
  content: string;
  sizeBytes: number;
  language: SupportedLanguage;
  isTestFile: boolean;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code:
    | 'PATH_TRAVERSAL'
    | 'ABSOLUTE_PATH'
    | 'OVERSIZED_FILE'
    | 'OVERSIZED_ARCHIVE'
    | 'TOO_MANY_FILES'
    | 'SECRET_DETECTED'
    | 'UNSUPPORTED_FILE_TYPE'
    | 'SUSPICIOUS_COMPRESSION_RATIO'
    | 'EMPTY_REPOSITORY'
    | 'EXCLUDED_PATH';
  filePath?: string;
  message: string;
  detail?: string;
}

export interface ExcludedFileEntry {
  path: string;
  reason:
    | 'excluded_directory'
    | 'binary_or_unsupported'
    | 'oversized_file'
    | 'secret_detected';
  detail: string;
}

export interface ValidationReport {
  valid: boolean;
  archiveName: string;
  inspectedAt: string;
  totalFilesInspected: number;
  acceptedFilesCount: number;
  totalSizeBytes: number;
  maxAllowedFileBytes: number;
  maxAllowedArchiveBytes: number;
  issues: ValidationIssue[];
  excludedFiles?: ExcludedFileEntry[];
  checksSummary: {
    pathTraversalPassed: boolean;
    sizeLimitsPassed: boolean;
    secretScanPassed: boolean;
    fileTypesPassed: boolean;
  };
}

export interface FileSymbolMetadata {
  path: string;
  definedFunctions: string[];
  definedClasses: string[];
  importedModules: string[];
  importedSymbols: string[];
  calledSymbols: string[];
  lineCount: number;
}

export interface CallerEdge {
  callerFile: string;
  calleeFile: string;
  symbols: string[];
}

export interface LanguageToolchainProfile {
  primaryLanguage: string;
  detectedLanguages: string[];
  packageManager: string;
  buildSystem: string;
  testFramework: string;
  hasExistingTests: boolean;
  recommendedTestCommand: string;
  recommendedLintOrTypecheckCommand?: string;
  manifestFiles: string[];
  runtimeAvailableInSandbox: boolean;
  unavailableReason?: string;
}

export interface RepositoryFindings {
  language: string;
  detected_languages?: string[];
  package_manager?: string;
  build_system?: string;
  test_framework?: string;
  dependencies: string[];
  entry_points: string[];
  relevant_files: string[];
  existing_tests: string[];
  caller_relationships: string[];
  total_files_indexed?: number;
  excluded_paths?: string[];
}

export interface ContextFileSelection {
  path: string;
  mode: 'full' | 'excerpt';
  reason:
    | 'target_source'
    | 'selected_in_editor'
    | 'caller_dependency'
    | 'callee_dependency'
    | 'related_test'
    | 'project_config'
    | 'entry_point';
  estimatedTokens: number;
  contentSent: string;
  totalLines: number;
  includedLineRange?: string;
  truncationWarning?: string;
}

export interface ContextExcludedItem {
  path: string;
  reason: 'budget_exceeded' | 'low_relevance' | 'excluded_artifact';
  estimatedTokens: number;
}

export interface ContextSelectionReport {
  maxTokenBudget: number;
  totalEstimatedTokens: number;
  includedFiles: ContextFileSelection[];
  excludedFiles: ContextExcludedItem[];
  symbolGraphSummary: string[];
  truncationWarnings?: string[];
}

export type AgentTaskLifecycleState =
  | 'INSPECTING'
  | 'PLANNING'
  | 'EDITING'
  | 'VALIDATING_PATCH'
  | 'RUNNING_TESTS'
  | 'REPAIRING'
  | 'VERIFIED'
  | 'FAILED'
  | 'NOT_VERIFIED';

export type VerificationStatus =
  | 'VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'FAILED'
  | 'NOT_VERIFIED'
  | 'NEEDS_REVIEW';

export type TestVerificationOutcome =
  | 'TESTS_PASSED'
  | 'TESTS_FAILED'
  | 'PARTIALLY_VERIFIED'
  | 'NOT_VERIFIED';

export type QuickAgentActionType =
  | 'explain-code'
  | 'find-bug'
  | 'fix-bug'
  | 'refactor'
  | 'generate-tests'
  | 'implement-feature'
  | 'custom';

export interface CodeSelectionContext {
  filePath: string;
  language: SupportedLanguage;
  startLine: number;
  endLine: number;
  selectedText: string;
}

export type RootCauseClassification =
  | 'CONFIRMED'
  | 'HYPOTHESIS'
  | 'NONE_NO_CHANGE_NEEDED'
  | 'AMBIGUOUS_TASK';

export interface StructuredRootCause {
  type: RootCauseClassification;
  description: string;
  evidence_files: string[];
}

export interface SearchReplaceHunk {
  search: string;
  replace: string;
}

export interface ProposedFilePatchItem {
  file_path: string;
  operation: 'modify' | 'no_change';
  explanation: string;
  search_replace_blocks?: SearchReplaceHunk[];
  patched_content?: string;
}

export interface StructuredAgentOutput {
  task_summary: string;
  acceptance_criteria: string[];
  repository_findings: RepositoryFindings;
  root_cause: StructuredRootCause;
  clarifying_question?: string | null;
  files_to_change: string[];
  proposed_patch: ProposedFilePatchItem[];
  tests_to_run: {
    targeted_tests: string[];
    full_suite_command: string;
  };
  verification_status: VerificationStatus;
  remaining_risks: string[];
}

export interface PatchValidationDiagnostic {
  filePath: string;
  valid: boolean;
  appliesCleanly: boolean;
  syntaxValid: boolean;
  importsValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AgentDiagnosticsReport {
  providerId: AIProviderId;
  providerName: string;
  modelIdentifier: string;
  timestamp: string;
  contextReport: ContextSelectionReport;
  toolchainProfile?: LanguageToolchainProfile;
  schemaValidationRetryTriggered: boolean;
  responseValidationErrors: string[];
  patchValidationDiagnostics: PatchValidationDiagnostic[];
  patchApplicationErrors: string[];
  targetedTestCommand: string;
  fullSuiteTestCommand: string;
  actualTestOutputs: Array<{
    attempt: number;
    phase: 'targeted' | 'full_suite' | 'static_verification';
    command: string;
    executedInRealSandbox: boolean;
    exitCode: number | null;
    output: string;
  }>;
  repairAttemptsCount: number;
  finalVerificationStatus: VerificationStatus;
  testOutcome?: TestVerificationOutcome;
}

export interface StructuredPlanStep {
  stepNumber: number;
  title: string;
  targetFile: string;
  rationale: string;
  operation: 'modify' | 'create' | 'verify' | 'no_change';
}

export interface AIAnalysisPlan {
  summary: string;
  rootCause: string;
  rootCauseType?: RootCauseClassification;
  acceptanceCriteria?: string[];
  repositoryFindings?: RepositoryFindings;
  clarifyingQuestion?: string | null;
  remainingRisks?: string[];
  testsToRun?: {
    targeted_tests: string[];
    full_suite_command: string;
  };
  affectedFiles: string[];
  inspectedFiles?: string[];
  steps: StructuredPlanStep[];
  riskAssessment: string;
  testStrategy: string;
  providerUsed: string;
  modelUsed: string;
  generatedAt: string;
}

export interface FilePatchChange {
  filePath: string;
  explanation: string;
  originalContent: string;
  proposedContent: string;
}

export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
}

export interface FileDiffResult {
  filePath: string;
  explanation: string;
  addedCount: number;
  removedCount: number;
  lines: DiffLine[];
  unifiedDiff: string;
}

export type WorkflowStageId =
  | 'repo_inspection'
  | 'task_planning'
  | 'patch_generation'
  | 'patch_validation'
  | 'test_execution'
  | 'repair_attempts'
  | 'final_report';

export interface ProposedPatchBundle {
  id: string;
  taskDescription: string;
  actionType?: QuickAgentActionType;
  selectionContext?: CodeSelectionContext | null;
  lifecycleState?: AgentTaskLifecycleState;
  plan: AIAnalysisPlan;
  structuredOutput?: StructuredAgentOutput;
  changes: FilePatchChange[];
  diffs: FileDiffResult[];
  unifiedPatchFile: string;
  approvalStatus: 'pending_review' | 'approved_staged' | 'rejected';
  approvedAt?: string;
  attemptNumber: number;
  verificationStatus: VerificationStatus;
  testOutcome?: TestVerificationOutcome;
  needsClarification?: boolean;
  clarifyingQuestion?: string | null;
  isNoChangeTask?: boolean;
  patchValidationPassed: boolean;
  diagnostics?: AgentDiagnosticsReport;
}

export type SandboxExecutionMode =
  | 'strict_isolated_only'
  | 'demo_simulation_labeled';

export interface SandboxAttemptLog {
  attempt: number;
  maxRetries: number;
  status: 'passed' | 'failed' | 'partially_verified' | 'sandbox_unavailable' | 'not_verified' | 'error';
  verificationStatus: VerificationStatus;
  testOutcome?: TestVerificationOutcome;
  isSimulated: boolean;
  simulationNotice?: string;
  targetedCommand?: string;
  command: string;
  durationMs: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  failedTests: string[];
  passedCount: number;
  failedCount: number;
  syntaxAndImportErrors?: string[];
  repairAnalysis?: string;
  repairedFiles?: FilePatchChange[];
  resourceLimits: {
    memoryMb: number;
    cpuCores: number;
    timeoutMs: number;
    networkAccess: 'disabled';
  };
}

export interface SandboxRunResponse {
  overallStatus:
    | 'passed'
    | 'partially_verified'
    | 'failed_after_retries'
    | 'sandbox_unavailable'
    | 'not_verified'
    | 'error';
  verificationStatus: VerificationStatus;
  testOutcome: TestVerificationOutcome;
  lifecycleState: AgentTaskLifecycleState;
  executionEnvironment:
    | 'isolated_container'
    | 'simulated_demo_runner'
    | 'blocked_no_sandbox';
  isSimulated: boolean;
  bannerMessage: string;
  retryCount: number;
  maxRetries: number;
  attempts: SandboxAttemptLog[];
  finalPatchBundle?: ProposedPatchBundle;
  diagnostics?: AgentDiagnosticsReport;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: string;
  content: string;
  actionType?: QuickAgentActionType;
  selectionContext?: CodeSelectionContext | null;
  lifecycleState?: AgentTaskLifecycleState;
  verificationStatus?: VerificationStatus;
  testOutcome?: TestVerificationOutcome;
  inspectedFiles?: string[];
  modifiedFiles?: string[];
  patchBundleId?: string;
}

export interface SampleRepositoryPreset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  defaultTask: string;
  suggestedTasks: string[];
  files: RepoFile[];
}
