import React from 'react';
import type { SupportedLanguage } from '../types/repopilot';

const KEYWORDS_BY_LANG: Record<string, Set<string>> = {
  python: new Set([
    'def',
    'class',
    'return',
    'if',
    'elif',
    'else',
    'for',
    'while',
    'in',
    'not',
    'and',
    'or',
    'import',
    'from',
    'as',
    'raise',
    'try',
    'except',
    'finally',
    'with',
    'pass',
    'break',
    'continue',
    'True',
    'False',
    'None',
    'async',
    'await',
    'lambda',
    'yield',
    'assert',
    'self',
  ]),
  typescript: new Set([
    'function',
    'const',
    'let',
    'var',
    'return',
    'if',
    'else',
    'for',
    'while',
    'import',
    'export',
    'from',
    'interface',
    'type',
    'class',
    'extends',
    'implements',
    'new',
    'async',
    'await',
    'try',
    'catch',
    'finally',
    'throw',
    'true',
    'false',
    'null',
    'undefined',
    'readonly',
    'public',
    'private',
  ]),
  javascript: new Set([
    'function',
    'const',
    'let',
    'var',
    'return',
    'if',
    'else',
    'for',
    'while',
    'import',
    'export',
    'from',
    'class',
    'new',
    'async',
    'await',
    'try',
    'catch',
    'finally',
    'throw',
    'true',
    'false',
    'null',
    'undefined',
  ]),
  go: new Set([
    'package',
    'import',
    'func',
    'type',
    'struct',
    'interface',
    'return',
    'if',
    'else',
    'for',
    'range',
    'var',
    'const',
    'defer',
    'go',
    'map',
    'chan',
    'true',
    'false',
    'nil',
  ]),
  rust: new Set([
    'fn',
    'pub',
    'let',
    'mut',
    'struct',
    'enum',
    'impl',
    'trait',
    'use',
    'mod',
    'match',
    'if',
    'else',
    'for',
    'while',
    'loop',
    'return',
    'true',
    'false',
    'Some',
    'None',
    'Ok',
    'Err',
  ]),
};

export function renderHighlightedLine(
  line: string,
  language: SupportedLanguage
): React.ReactNode {
  if (!line) return ' ';

  const trimmed = line.trim();
  // Full-line comments
  if (
    (language === 'python' ||
      language === 'shell' ||
      language === 'yaml' ||
      language === 'toml') &&
    trimmed.startsWith('#')
  ) {
    return <span className="text-slate-500 italic">{line}</span>;
  }
  if (
    [
      'typescript',
      'javascript',
      'java',
      'c',
      'cpp',
      'csharp',
      'go',
      'rust',
      'swift',
      'kotlin',
      'php',
    ].includes(language) &&
    trimmed.startsWith('//')
  ) {
    return <span className="text-slate-500 italic">{line}</span>;
  }

  const kwSet =
    KEYWORDS_BY_LANG[language] ||
    KEYWORDS_BY_LANG.typescript ||
    KEYWORDS_BY_LANG.python;

  // Tokenize strings, numbers, decorators, identifiers, and punctuation
  const tokenRegex =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|@[A-Za-z_][A-Za-z0-9_.]*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${match.index}-${token}`;

    if (
      token.startsWith('"') ||
      token.startsWith("'") ||
      token.startsWith('`')
    ) {
      parts.push(
        <span key={key} className="text-emerald-300">
          {token}
        </span>
      );
    } else if (token.startsWith('@')) {
      parts.push(
        <span key={key} className="text-amber-300">
          {token}
        </span>
      );
    } else if (/^\d/.test(token)) {
      parts.push(
        <span key={key} className="text-amber-300">
          {token}
        </span>
      );
    } else if (kwSet.has(token)) {
      parts.push(
        <span key={key} className="text-sky-400 font-semibold">
          {token}
        </span>
      );
    } else if (/^[A-Z][A-Za-z0-9_]*$/.test(token)) {
      parts.push(
        <span key={key} className="text-indigo-300">
          {token}
        </span>
      );
    } else {
      parts.push(token);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }

  return parts;
}
