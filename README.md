# RepoPilot AI — Autonomous Level 2 Coding Agent
**Nebius × NVIDIA Global AI Hackathon — Coding and Agentic Engineering Track**

RepoPilot AI is a safety-gated, Level 2 Autonomous Coding Agent that inspects multi-file software repositories, builds a normalized project manifest, creates a concise task plan, identifies root-cause bugs with line-level evidence, proposes minimal surgical patches, validates syntax and imports against the uploaded project tree, enforces explicit developer approval, executes checks in a disposable workspace with up to 2 autonomous repair iterations, and exports the corrected repository as individual files or a `.zip` archive.

---

## Architecture Overview

1. **Web Coding Agent Workspace (`src/`, `server.ts`)**:
   - **Upload & Validation (`src/utils/securityValidator.ts`)**: Supports drag-and-drop or file-picker uploads for `.zip` archives and multiple individual source files. Rejects path traversal (`../`), absolute paths, zip bombs, oversized files, and embedded secrets (`.env`, private keys, API tokens).
   - **Project Context & Manifest Indexing (`src/utils/repoAnalyzer.ts`)**: Builds a normalized project manifest (`buildNormalizedProjectManifest`), call-graph index, and token-budgeted context selector (`selectContextForTask`). Explicitly distinguishes single-file incomplete context from full multi-file project trees.
   - **Multi-Provider AI Abstraction (`src/server/aiProviders.ts`)**:
     - **Nebius Token Factory**: OpenAI-compatible chat completions adapter (`https://api.tokenfactory.nebius.com/v1`) running NVIDIA open-source Nemotron models (e.g., `nvidia/Llama-3_1-Nemotron-Ultra-253B-v1`, `nvidia/Llama-3_3-Nemotron-Super-49B-v1`, `nvidia/llama-3.1-nemotron-70b-instruct`) and coding models (`Qwen/Qwen2.5-Coder-32B-Instruct`, `deepseek-ai/DeepSeek-V3`).
     - **NVIDIA NIM**: OpenAI-compatible adapter (`https://integrate.api.nvidia.com/v1`) honoring the exact `NVIDIA_MODEL` configured by the developer.
     - **Google Gemini**: Server-side `@google/genai` SDK (`gemini-3-flash-preview` / `gemini-3.1-pro-preview`) with strict JSON schema validation.
     - **Strict Credential Policy**: Never invents model IDs, never fakes AI responses, never exposes API keys to the client, and never silently falls back to Gemini when Nebius or NVIDIA is selected.
   - **10-Step Level 2 Agent Workflow & 2-Attempt Repair Loop (`src/server/sandboxRunner.ts`)**:
     1. Inspect uploaded files and build normalized project context.
     2. Create a concise task plan and acceptance criteria.
     3. Identify root-cause bugs and propose a structured search/replace patch.
     4. Validate patch target paths, syntax, and imports against the uploaded manifest.
     5. Require explicit developer approval (`Accept & Apply Changes`).
     6. Apply the approved patch strictly in a separate disposable workspace copy (`applyApprovedPatchImmutably`).
     7. Run supported static checks and tests in a restricted environment.
     8. Feed actual failure output and stack traces back to the AI model for up to **2 autonomous repair attempts** (`maxRetries = 2`).
     9. Display test results accurately, distinguishing **Passed**, **Failed**, **Skipped**, and **Not Run**.
     10. Let the developer inspect diffs and download corrected individual files or a corrected `.zip` archive.
2. **Installable VS Code Extension (`vscode-extension/`)**:
   - Real TypeScript VS Code extension using `vscode.workspace.workspaceFolders`, `vscode.TreeDataProvider`, `vscode.WebviewViewProvider`, and `vscode.SecretStorage`.

---

## Quick Start & Setup Instructions

### 1. Prerequisites
- **Node.js** 20+ and **npm**
- At least one server-side AI provider API key:
  - `NEBIUS_API_KEY` (for Nebius Token Factory at `https://api.tokenfactory.nebius.com/v1`)
  - `NVIDIA_API_KEY` (for NVIDIA NIM at `https://integrate.api.nvidia.com/v1`)
  - `GEMINI_API_KEY` (for Google Gemini Server SDK)

### 2. Configure Environment Variables
Copy `.env.example` to `.env` in the project root and set your server-side credentials (secrets are git-ignored and never sent to the browser):

```bash
cp .env.example .env
```

Key environment variables in `.env`:
```ini
# Nebius Token Factory (Default base URL: https://api.tokenfactory.nebius.com/v1)
NEBIUS_API_KEY="your_nebius_token_factory_api_key"
NEBIUS_BASE_URL="https://api.tokenfactory.nebius.com/v1"
NEBIUS_MODEL="nvidia/Llama-3_1-Nemotron-Ultra-253B-v1"

# NVIDIA NIM / Open-Source Nemotron Model
NVIDIA_API_KEY="your_nvidia_api_key"
NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"
NVIDIA_MODEL="nvidia/llama-3.1-nemotron-70b-instruct"

# Google Gemini Server SDK
GEMINI_API_KEY="your_gemini_api_key"

# Optional Isolated Container Sandbox Runner
SANDBOX_RUNNER_URL=""
ENABLE_DOCKER_SANDBOX="false"
```

### 3. Install, Test, Build, and Start
```bash
# Install dependencies
npm install

# Run the automated unit test suite
npm test

# Type-check and build the production frontend bundle
npm run lint
npm run build

# Start the development server on http://localhost:3000
npm run dev
```

For production deployment (e.g., Cloud Run, Render, Fly.io, Railway, or a Linux VM):
```bash
npm ci
npm run build
NODE_ENV=production npm start
```

### 4. VS Code Extension Setup (Windows / macOS / Linux)
```bash
cd vscode-extension
npm install
npm run compile
code .
# Press F5 inside VS Code to launch the [Extension Development Host] window
```

---

## Hackathon Project Description Draft (Nebius × NVIDIA Global AI Hackathon)

**Title:** RepoPilot AI — Safety-Gated Level 2 Autonomous Coding Agent powered by Nebius Token Factory & NVIDIA Nemotron

**Track:** Coding and Agentic Engineering

**Summary:**
RepoPilot AI is an autonomous software engineering workspace that transforms bug diagnosis, surgical patch generation, and test-driven self-repair into a transparent, approval-gated workflow. Powered by **NVIDIA open-source Nemotron models** (`nvidia/Llama-3_1-Nemotron-Ultra-253B-v1` / `nvidia/llama-3.1-nemotron-70b-instruct`) running on **Nebius Token Factory** (`https://api.tokenfactory.nebius.com/v1`), RepoPilot AI indexes multi-file repositories, traces caller/callee relationships, distinguishes incomplete single-file snippets from full project trees, proposes minimal search-and-replace diffs, and runs up to 2 autonomous repair loops using real test failure output before packaging a verified `.zip` export.

---

## Demo Video Storyboard (< 3 Minutes)

- **0:00 – 0:25 | Problem & Architecture Hook**: Show RepoPilot AI's clean chat interface and OpenAI-compatible provider selector configured with **Nebius Token Factory (`https://api.tokenfactory.nebius.com/v1`)** and **NVIDIA Nemotron (`nvidia/Llama-3_1-Nemotron-Ultra-253B-v1`)**.
- **0:25 – 1:00 | Safe Repository Upload & Context Indexing**: Drag-and-drop a Python project `.zip` archive (demonstrating automatic `.env`/secret filtering and normalized project manifest generation).
- **1:00 – 1:45 | Root-Cause Bug Analysis & Surgical Diff Preview**: Submit a bug-fix task. Show the structured plan, line-referenced bug card, and side-by-side unified diff with `Accept & Apply Changes` approval gate.
- **1:45 – 2:30 | Disposable Workspace Verification & 2-Step Autonomous Repair Loop**: Approve the patch, trigger test execution, inspect the **Passed / Failed / Skipped / Not Run** test summary and up-to-2 repair attempts log.
- **2:30 – 2:55 | Corrected Export & VS Code Extension**: Click **Download Corrected ZIP** to export the patched repository and briefly show the companion `vscode-extension/` workspace inspector.

