# RepoPilot AI — VS Code Extension (Phase 1: Workspace Inspection & AI Analysis)

This directory (`/vscode-extension`) contains the real, installable **RepoPilot AI** VS Code extension written in TypeScript using the official VS Code Extension API (`vscode`).

> **Phase 1 Scope Notice:**
> Phase 1 implements **real workspace inspection, nested directory & multi-filetype exploration, filename/text search, active file inspection, and context-selective AI analysis (with read-only proposed patch previews)**. Automated code edits (`WorkspaceEdit`) and terminal test execution are **not** enabled yet in Phase 1.

---

## 1. Phase 1 Architecture & Capabilities

1. **Activity Bar Container & Sidebar Views (`package.json`)**:
   - Registers the **RepoPilot AI** icon in the VS Code Activity Bar (`repopilot-sidebar`).
   - Contributes two views:
     - **Workspace Explorer (`repopilot.workspaceExplorerView`)**: Native VS Code `TreeDataProvider` supporting nested directories and multiple file types (`.py`, `.ts`, `.tsx`, `.js`, `.rs`, `.go`, `.java`, `.json`, `.yaml`, `.toml`, `.md`, etc.).
     - **RepoPilot AI Chat & Inspector (`repopilot.chatView`)**: Sidebar webview with interactive nested directory browser, file reader, filename search, text search, and AI task analysis.
2. **Registered VS Code Commands**:
   - `repopilot.openSidebar` (`RepoPilot AI: Open Sidebar`)
   - `repopilot.openChat` (`RepoPilot AI: Focus Chat Interface`)
   - `repopilot.inspectWorkspace` (`RepoPilot AI: Inspect Current Workspace`)
   - `repopilot.analyzeActiveFile` (`RepoPilot AI: Analyze Active File`)
   - `repopilot.openWorkspaceFile` (`RepoPilot AI: Inspect File in Sidebar`)
   - `repopilot.configureApiKey` (`RepoPilot AI: Configure Provider API Key (SecretStorage)`)
3. **Workspace Detection & Safe Tools (`src/tools/workspaceTools.ts`)**:
   - Uses `vscode.workspace.workspaceFolders` to detect the currently open project root.
   - **File Listing & Nested Explorer**: `listAndReadWorkspaceFiles()` + `buildNestedDirectoryTree()`
   - **File Reading**: `readWorkspaceFile(relativePath)`
   - **Filename Search**: `searchWorkspaceFilenames(query)`
   - **Text Search**: `searchWorkspaceCode(query)`
   - **Automatic Exclusions (`src/core/workspaceSafety.ts`)**: Excludes `.git`, `node_modules`, virtual environments (`.venv`, `venv`), build outputs (`dist`, `build`, `out`, `target`), secret files (`.env*`, `.pem`, `.key`, inline credentials), binary files, and oversized files (`> 256 KB`).
4. **Validated Webview Message Passing (`validateWebviewInboundMessage`)**:
   - Every message sent from the webview (`inspectWorkspace`, `analyzeActiveFile`, `submitTask`, `readFile`, `searchFilenames`, `searchText`, `configureApiKey`) is strictly validated before execution.
   - Any attempt by the webview to read outside the active workspace root (`../`, absolute host paths, or Windows drive-letter escapes) is blocked immediately.
5. **Typed Provider Interface & Credential Security (`src/providers/aiClient.ts`)**:
   - Defines the typed `AIModelProvider` interface with two concrete implementations:
     - `RepoPilotBackendProvider` (`repopilot-backend`): Reuses the RepoPilot AI Node.js backend (`POST /api/vscode/agent-turn`).
     - `DirectConfiguredModelProvider` (`direct-provider`): Calls Gemini or OpenAI-compatible endpoints (Nebius Token Factory, NVIDIA Nemotron) directly using credentials stored in `vscode.SecretStorage`.
   - API keys are **never** stored in or exposed to the webview/browser code.
6. **Explicit Error States in the Sidebar**:
   - Clearly surfaces **Loading**, **Missing Workspace (`MISSING_WORKSPACE`)**, **Missing Credentials (`MISSING_CREDENTIALS`)**, **Unsupported/Excluded File (`UNSUPPORTED_FILE`)**, and **API Errors (`API_ERROR`)**.

---

## 2. Windows Installation & Testing Instructions (PowerShell / CMD)

### Prerequisites on Windows
- **Node.js 20+** (`node -v` and `npm -v` in PowerShell)
- **Visual Studio Code** (`code -v`) installed on Windows

### Step 1: Start the RepoPilot AI Backend (Optional if using `direct-provider` mode)
Open **Windows PowerShell** in the repository root folder:

```powershell
# In the root RepoPilot AI directory
npm install
Copy-Item .env.example .env
# Edit .env in Notepad or VS Code and set GEMINI_API_KEY (or NEBIUS_API_KEY / NVIDIA_API_KEY)
notepad .env

# Start the RepoPilot AI server on http://localhost:3000
npm run dev
```

### Step 2: Install Dependencies & Compile the VS Code Extension on Windows
Open a **second PowerShell window** and navigate into `vscode-extension`:

```powershell
cd vscode-extension
npm install
npm run compile
```

Verify that `vscode-extension\dist\extension.js` was generated with zero TypeScript errors.

### Step 3: Launch the Extension Development Host in VS Code on Windows
Still inside `vscode-extension` (or by opening the `vscode-extension` folder in VS Code):

```powershell
code .
```

1. Press **`F5`** on your keyboard (or click **Run -> Start Debugging**).
2. VS Code will open a new **`[Extension Development Host]`** window with the RepoPilot AI extension loaded.
3. In the **`[Extension Development Host]`** window:
   - Press **`Ctrl+K Ctrl+O`** (**File -> Open Folder...**) and open any local Python, TypeScript, Rust, or Go project folder on your Windows machine (e.g., `C:\Users\<YourName>\Projects\my-python-app`).
   - Click the **RepoPilot AI** shield icon in the left Activity Bar (or press **`Ctrl+Shift+P`** and run **`RepoPilot AI: Open Sidebar`**).
   - Run **`RepoPilot AI: Inspect Current Workspace`** from the Command Palette (`Ctrl+Shift+P`) or click **Inspect** in the sidebar to populate the nested file explorer.
   - Click any file in the nested explorer to read its contents safely in the sidebar.
   - Use **Filename Search** or **Text Search** to search across your workspace.
   - Open any file in the editor and run **`RepoPilot AI: Analyze Active File`** (`Ctrl+Shift+P`) or enter a coding task and click **Analyze Task**.

---

## 3. Configuring the AI Provider & SecretStorage Credentials

You can configure RepoPilot AI in VS Code Settings (**`Ctrl+,`** -> search for `RepoPilot AI`):

- **`repopilot.connectionMode`**:
  - `"repopilot-backend"` *(default)*: Reuses the local RepoPilot AI server at `http://localhost:3000` (`repopilot.backendUrl`), reading API keys from the server's `.env` file.
  - `"direct-provider"`: Connects directly from the VS Code Extension Host to Gemini or an OpenAI-compatible API (`repopilot.openaiCompatibleBaseUrl`) using an API key stored in **VS Code `SecretStorage`** (Windows Credential Manager).
- **How to Store an API Key in VS Code `SecretStorage`**:
  1. Press **`Ctrl+Shift+P`** in VS Code.
  2. Run **`RepoPilot AI: Configure Provider API Key (SecretStorage)`** (or click the **API Key** button in the RepoPilot AI sidebar).
  3. Paste your Gemini, Nebius Token Factory, or NVIDIA API key into the masked VS Code password input box and press **Enter**.

---

## 4. Running the Unit Tests on Windows

From the root repository directory in PowerShell:

```powershell
npm test
```

This runs the automated `node:test` suite verifying Windows & POSIX workspace path restrictions (`isPathInsideWorkspace`), `.git`/`node_modules`/virtualenv/binary/secret exclusions (`shouldExcludeFromWorkspaceIndex`), nested directory tree construction (`buildNestedDirectoryTree`), and webview message validation (`validateWebviewInboundMessage`).
