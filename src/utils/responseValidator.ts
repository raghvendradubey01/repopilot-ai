import type {
  RepoFile,
  StructuredAgentOutput,
  VerificationStatus,
} from '../types/repopilot';

const VALID_VERIFICATION_STATUSES = new Set<VerificationStatus>([
  'VERIFIED',
  'PARTIALLY_VERIFIED',
  'FAILED',
  'NOT_VERIFIED',
  'NEEDS_REVIEW',
]);

const VALID_ROOT_CAUSE_TYPES = new Set([
  'CONFIRMED',
  'HYPOTHESIS',
  'NONE_NO_CHANGE_NEEDED',
  'AMBIGUOUS_TASK',
]);

export interface SchemaValidationResult {
  valid: boolean;
  parsed?: StructuredAgentOutput;
  errors: string[];
}

/**
 * Validates raw model text against the mandatory RepoPilot AI JSON schema
 * and checks that all referenced files exist in the repository.
 */
export function validateStructuredAgentResponse(
  rawText: string,
  repoFiles: readonly RepoFile[]
): SchemaValidationResult {
  const errors: string[] = [];

  if (!rawText || !rawText.trim()) {
    return {
      valid: false,
      errors: ['Model returned an empty response string.'],
    };
  }

  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let obj: Record<string, unknown>;
  try {
    const parsedJson = JSON.parse(cleaned);
    if (!parsedJson || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
      return {
        valid: false,
        errors: ['Top-level JSON value must be an object.'],
      };
    }
    obj = parsedJson as Record<string, unknown>;
  } catch (err) {
    return {
      valid: false,
      errors: [
        `Malformed JSON syntax: ${
          err instanceof Error ? err.message : 'Unable to parse JSON'
        }`,
      ],
    };
  }

  // 1. Validate task_summary
  if (typeof obj.task_summary !== 'string' || !obj.task_summary.trim()) {
    errors.push('Missing or empty required string field "task_summary".');
  }

  // 2. Validate acceptance_criteria
  if (
    !Array.isArray(obj.acceptance_criteria) ||
    obj.acceptance_criteria.length === 0 ||
    !obj.acceptance_criteria.every((item) => typeof item === 'string' && item.trim())
  ) {
    errors.push(
      'Field "acceptance_criteria" must be a non-empty array of strings.'
    );
  }

  // 3. Validate repository_findings
  const rf = obj.repository_findings as Record<string, unknown> | undefined;
  if (!rf || typeof rf !== 'object') {
    errors.push('Missing required object field "repository_findings".');
  } else {
    if (typeof rf.language !== 'string' || !rf.language.trim()) {
      errors.push('Missing "repository_findings.language".');
    }
    if (!Array.isArray(rf.dependencies)) {
      errors.push('"repository_findings.dependencies" must be an array.');
    }
    if (!Array.isArray(rf.entry_points)) {
      errors.push('"repository_findings.entry_points" must be an array.');
    }
    if (!Array.isArray(rf.relevant_files)) {
      errors.push('"repository_findings.relevant_files" must be an array.');
    }
    if (!Array.isArray(rf.existing_tests)) {
      errors.push('"repository_findings.existing_tests" must be an array.');
    }
  }

  // 4. Validate root_cause
  const rc = obj.root_cause as Record<string, unknown> | undefined;
  if (!rc || typeof rc !== 'object') {
    errors.push('Missing required object field "root_cause".');
  } else {
    if (
      typeof rc.type !== 'string' ||
      !VALID_ROOT_CAUSE_TYPES.has(rc.type)
    ) {
      errors.push(
        `"root_cause.type" must be one of: ${Array.from(VALID_ROOT_CAUSE_TYPES).join(
          ', '
        )}.`
      );
    }
    if (typeof rc.description !== 'string' || !rc.description.trim()) {
      errors.push('Missing or empty "root_cause.description".');
    }
    if (!Array.isArray(rc.evidence_files)) {
      errors.push('"root_cause.evidence_files" must be an array of file paths.');
    }
  }

  // 5. Validate files_to_change against actual repository files
  const validPathSet = new Set(repoFiles.map((f) => f.path));

  if (!Array.isArray(obj.files_to_change)) {
    errors.push('"files_to_change" must be an array of strings.');
  } else {
    for (const fp of obj.files_to_change) {
      if (typeof fp !== 'string' || !validPathSet.has(fp)) {
        errors.push(
          `Invalid file in "files_to_change": "${String(
            fp
          )}" does not exist in the repository.`
        );
      }
    }
  }

  // 6. Validate proposed_patch
  if (!Array.isArray(obj.proposed_patch)) {
    errors.push('"proposed_patch" must be an array.');
  } else {
    for (let i = 0; i < obj.proposed_patch.length; i++) {
      const p = obj.proposed_patch[i] as Record<string, unknown>;
      if (!p || typeof p !== 'object') {
        errors.push(`"proposed_patch[${i}]" must be an object.`);
        continue;
      }
      if (typeof p.file_path !== 'string' || !validPathSet.has(p.file_path)) {
        errors.push(
          `"proposed_patch[${i}].file_path" ("${String(
            p.file_path
          )}") does not exist in the repository. Never invent file names.`
        );
      }
      if (p.operation !== 'modify' && p.operation !== 'no_change') {
        errors.push(
          `"proposed_patch[${i}].operation" must be "modify" or "no_change".`
        );
      }
      if (typeof p.explanation !== 'string' || !p.explanation.trim()) {
        errors.push(`"proposed_patch[${i}].explanation" is required.`);
      }
      if (p.operation === 'modify') {
        const hasBlocks =
          Array.isArray(p.search_replace_blocks) &&
          p.search_replace_blocks.length > 0;
        const hasContent =
          typeof p.patched_content === 'string' &&
          p.patched_content.trim().length > 0;
        if (!hasBlocks && !hasContent) {
          errors.push(
            `"proposed_patch[${i}]" with operation="modify" must provide "search_replace_blocks" or "patched_content".`
          );
        }
      }
    }
  }

  // 7. Validate tests_to_run
  const ttr = obj.tests_to_run as Record<string, unknown> | undefined;
  if (!ttr || typeof ttr !== 'object') {
    errors.push('Missing required object field "tests_to_run".');
  } else {
    if (!Array.isArray(ttr.targeted_tests)) {
      errors.push('"tests_to_run.targeted_tests" must be an array of strings.');
    }
    if (
      typeof ttr.full_suite_command !== 'string' ||
      !ttr.full_suite_command.trim()
    ) {
      errors.push('"tests_to_run.full_suite_command" must be a non-empty string.');
    }
  }

  // 8. Validate verification_status
  if (
    typeof obj.verification_status !== 'string' ||
    !VALID_VERIFICATION_STATUSES.has(obj.verification_status as VerificationStatus)
  ) {
    errors.push(
      `"verification_status" must be one of: ${Array.from(
        VALID_VERIFICATION_STATUSES
      ).join(', ')}.`
    );
  }

  // 9. Validate remaining_risks
  if (!Array.isArray(obj.remaining_risks)) {
    errors.push('"remaining_risks" must be an array of strings.');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const parsedOutput: StructuredAgentOutput = {
    task_summary: String(obj.task_summary),
    acceptance_criteria: (obj.acceptance_criteria as string[]).map(String),
    repository_findings: {
      language: String(rf!.language),
      dependencies: (rf!.dependencies as unknown[]).map(String),
      entry_points: (rf!.entry_points as unknown[]).map(String),
      relevant_files: (rf!.relevant_files as unknown[]).map(String),
      existing_tests: (rf!.existing_tests as unknown[]).map(String),
      caller_relationships: Array.isArray(rf!.caller_relationships)
        ? (rf!.caller_relationships as unknown[]).map(String)
        : [],
    },
    root_cause: {
      type: rc!.type as StructuredAgentOutput['root_cause']['type'],
      description: String(rc!.description),
      evidence_files: (rc!.evidence_files as unknown[]).map(String),
    },
    clarifying_question:
      typeof obj.clarifying_question === 'string' &&
      obj.clarifying_question.trim()
        ? obj.clarifying_question.trim()
        : null,
    files_to_change: (obj.files_to_change as unknown[]).map(String),
    proposed_patch: (
      obj.proposed_patch as Array<Record<string, unknown>>
    ).map((p) => ({
      file_path: String(p.file_path),
      operation: p.operation as 'modify' | 'no_change',
      explanation: String(p.explanation),
      search_replace_blocks: Array.isArray(p.search_replace_blocks)
        ? (p.search_replace_blocks as Array<Record<string, unknown>>).map(
            (b) => ({
              search: String(b.search || ''),
              replace: String(b.replace || ''),
            })
          )
        : undefined,
      patched_content:
        typeof p.patched_content === 'string' ? p.patched_content : undefined,
    })),
    tests_to_run: {
      targeted_tests: (ttr!.targeted_tests as unknown[]).map(String),
      full_suite_command: String(ttr!.full_suite_command),
    },
    verification_status: obj.verification_status as VerificationStatus,
    remaining_risks: (obj.remaining_risks as unknown[]).map(String),
  };

  return {
    valid: true,
    parsed: parsedOutput,
    errors: [],
  };
}

export function buildSchemaCorrectionPrompt(
  originalResponse: string,
  validationErrors: string[],
  validFiles: readonly RepoFile[]
): string {
  const validPaths = validFiles.map((f) => f.path).join(', ');
  return [
    'Your previous JSON response failed backend schema validation.',
    'VALIDATION ERRORS:',
    ...validationErrors.map((e, i) => `${i + 1}. ${e}`),
    '',
    `VALID REPOSITORY FILE PATHS (Never invent file names): ${validPaths}`,
    '',
    'PREVIOUS INVALID RESPONSE:',
    originalResponse.slice(0, 2000),
    '',
    'Please return a corrected, valid JSON object containing all required fields: task_summary, acceptance_criteria, repository_findings, root_cause, files_to_change, proposed_patch, tests_to_run, verification_status, and remaining_risks.',
  ].join('\n');
}

/**
 * Executes a model query and validates the returned JSON.
 * Retries malformed responses ONCE with a correction request.
 * Never silently converts invalid responses into successful results.
 */
export async function executeModelQueryWithOneRetry(
  invokeModel: (correctionPrompt?: string) => Promise<string>,
  repoFiles: readonly RepoFile[]
): Promise<{
  success: boolean;
  output?: StructuredAgentOutput;
  retryTriggered: boolean;
  validationErrors: string[];
}> {
  const firstRaw = await invokeModel(undefined);
  const firstCheck = validateStructuredAgentResponse(firstRaw, repoFiles);

  if (firstCheck.valid && firstCheck.parsed) {
    return {
      success: true,
      output: firstCheck.parsed,
      retryTriggered: false,
      validationErrors: [],
    };
  }

  // Retry once with a specific schema correction prompt
  const correctionPrompt = buildSchemaCorrectionPrompt(
    firstRaw,
    firstCheck.errors,
    repoFiles
  );
  const secondRaw = await invokeModel(correctionPrompt);
  const secondCheck = validateStructuredAgentResponse(secondRaw, repoFiles);

  if (secondCheck.valid && secondCheck.parsed) {
    return {
      success: true,
      output: secondCheck.parsed,
      retryTriggered: true,
      validationErrors: firstCheck.errors,
    };
  }

  return {
    success: false,
    retryTriggered: true,
    validationErrors: [
      ...firstCheck.errors.map((e) => `[Attempt 1] ${e}`),
      ...secondCheck.errors.map((e) => `[Retry Attempt 2] ${e}`),
    ],
  };
}
