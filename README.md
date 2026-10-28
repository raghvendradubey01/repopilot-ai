# RepoPilot AI — Local Workspace Coding Agent & Web Dashboard

RepoPilot AI combines:
1. **Google AI Studio Web Dashboard (`src/`, `server.ts`)**: Preserves the complete web workspace with local workspace inspection, multi-provider AI analysis, diff review, and isolated sandbox verification.
2. **Real Installable VS Code Extension (`vscode-extension/` — Phase 1)**: A dedicated VS Code extension written in TypeScript using the VS Code Extension API (`vscode.workspace.workspaceFolders`, `vscode.TreeDataProvider`, `vscode.WebviewViewProvider`, and `vscode.SecretStorage`).

> **Phase 1 Scope (VS Code Extension):**
> Phase 1 implements **real workspace inspection, nested file exploration, filename & text search, active-file analysis, and context-selective AI analysis (read-only patch preview)**. It does not claim automated code edits or terminal execution are active in the extension yet.

---

## Windows Installation & Testing Guide (VS Code Extension + Web Dashboard)

### 1. Run the RepoPilot AI Web Dashboard & Backend on Windows
Open **PowerShell** in the project root directory:

```powershell
npm install
Copy-Item .env.example .env
# Add your GEMINI_API_KEY (and optional NEBIUS_API_KEY / NVIDIA_API_KEY) to .env
npm run dev
```

- Open `http://localhost:3000` in your browser to use the **RepoPilot AI Web Dashboard**.
- The backend also exposes `POST /api/vscode/agent-turn` so the VS Code extension can reuse the existing RepoPilot AI backend and model provider abstraction.

### 2. Compile & Launch the VS Code Extension on Windows
Open a second **PowerShell** window:

```powershell
cd vscode-extension
npm install
npm run compile
code .
```

1. Inside VS Code, press **`F5`** to launch the **`[Extension Development Host]`** window.
2. In the new window, open any project folder using **File -> Open Folder... (`Ctrl+K Ctrl+O`)**.
3. Click the **RepoPilot AI** icon in the Activity Bar or press **`Ctrl+Shift+P`** and run:
   - `RepoPilot AI: Open Sidebar`
   - `RepoPilot AI: Inspect Current Workspace`
   - `RepoPilot AI: Analyze Active File`
   - `RepoPilot AI: Configure Provider API Key (SecretStorage)`

### 3. Run Unit Tests
From the project root in PowerShell or bash:

```powershell
npm test
```
