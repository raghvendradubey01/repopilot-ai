import * as vscode from 'vscode';
import { RepoPilotWorkspaceTreeProvider } from './tools/workspaceTools';
import { RepoPilotChatSidebarProvider } from './webview/ChatSidebarProvider';

export function activate(context: vscode.ExtensionContext): void {
  const treeProvider = new RepoPilotWorkspaceTreeProvider();
  const sidebarProvider = new RepoPilotChatSidebarProvider(
    context,
    treeProvider
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'repopilot.workspaceExplorerView',
      treeProvider
    ),
    vscode.window.registerWebviewViewProvider(
      RepoPilotChatSidebarProvider.viewType,
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Status Bar Item showing RepoPilot AI Phase 1 Local Inspector status
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = '$(shield) RepoPilot AI: Workspace Inspector';
  statusBarItem.tooltip =
    'RepoPilot AI (Phase 1 Read-Only Inspector & AI Analyzer) — Click to open sidebar';
  statusBarItem.command = 'repopilot.openSidebar';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const focusSidebar = async () => {
    await vscode.commands.executeCommand(
      'workbench.view.extension.repopilot-sidebar'
    );
  };

  // Register Phase 1 Extension Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('repopilot.openSidebar', async () => {
      await focusSidebar();
    }),

    vscode.commands.registerCommand('repopilot.openChat', async () => {
      await focusSidebar();
    }),

    vscode.commands.registerCommand('repopilot.inspectWorkspace', async () => {
      await focusSidebar();
      await sidebarProvider.handleInspectWorkspace();
      vscode.window.showInformationMessage(
        'RepoPilot AI: Inspected active open workspace folder and filtered unsafe/binary files.'
      );
    }),

    vscode.commands.registerCommand('repopilot.analyzeActiveFile', async () => {
      await focusSidebar();
      await sidebarProvider.handleAnalyzeActiveFile();
    }),

    vscode.commands.registerCommand(
      'repopilot.openWorkspaceFile',
      async (relativePath?: string) => {
        if (typeof relativePath === 'string' && relativePath.trim()) {
          await focusSidebar();
          await sidebarProvider.handleInspectFileInSidebar(relativePath.trim());
        }
      }
    ),

    vscode.commands.registerCommand('repopilot.configureApiKey', async () => {
      const key = await vscode.window.showInputBox({
        prompt:
          'Enter Provider API Key to store securely in VS Code SecretStorage (never exposed to the webview or git)',
        password: true,
        ignoreFocusOut: true,
      });
      if (key !== undefined) {
        if (key.trim()) {
          await context.secrets.store('repopilot.apiKey', key.trim());
          vscode.window.showInformationMessage(
            'RepoPilot AI: Provider API key saved securely in OS keychain via VS Code SecretStorage.'
          );
        } else {
          await context.secrets.delete('repopilot.apiKey');
          vscode.window.showWarningMessage(
            'RepoPilot AI: Cleared stored API key from VS Code SecretStorage.'
          );
        }
      }
    })
  );
}

export function deactivate(): void {
  // Clean up resources on extension deactivation
}
