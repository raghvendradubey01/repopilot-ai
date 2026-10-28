declare module 'vscode' {
  export class Uri {
    readonly scheme: string;
    readonly fsPath: string;
    readonly path: string;
    static file(path: string): Uri;
    static parse(value: string): Uri;
  }

  export class Position {
    readonly line: number;
    readonly character: number;
    constructor(line: number, character: number);
  }

  export class Range {
    readonly start: Position;
    readonly end: Position;
    constructor(start: Position, end: Position);
    constructor(
      startLine: number,
      startCharacter: number,
      endLine: number,
      endCharacter: number
    );
  }

  export class Selection extends Range {
    readonly isEmpty: boolean;
  }

  export class Location {
    readonly uri: Uri;
    readonly range: Range;
  }

  export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
  }

  export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
  }

  export interface Diagnostic {
    range: Range;
    message: string;
    severity: DiagnosticSeverity;
    source?: string;
    code?: string | number | { value: string | number; target: Uri };
  }

  export class EventEmitter<T> {
    readonly event: (listener: (e: T) => unknown) => { dispose(): void };
    fire(data: T): void;
  }

  export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
  }

  export interface Command {
    title: string;
    command: string;
    tooltip?: string;
    arguments?: any[];
  }

  export class TreeItem {
    label?: string;
    id?: string;
    description?: string | boolean;
    tooltip?: string;
    collapsibleState?: TreeItemCollapsibleState;
    command?: Command;
    resourceUri?: Uri;
    contextValue?: string;
    constructor(label: string, collapsibleState?: TreeItemCollapsibleState);
    constructor(resourceUri: Uri, collapsibleState?: TreeItemCollapsibleState);
  }

  export interface TreeDataProvider<T> {
    onDidChangeTreeData?: (listener: (e: T | undefined | null | void) => unknown) => {
      dispose(): void;
    };
    getTreeItem(element: T): TreeItem | Thenable<TreeItem>;
    getChildren(element?: T): T[] | Thenable<T[]>;
  }

  export interface TextLine {
    readonly text: string;
  }

  export interface TextDocument {
    readonly uri: Uri;
    readonly languageId: string;
    getText(range?: Range): string;
    positionAt(offset: number): Position;
    lineAt(line: number): TextLine;
    save(): Thenable<boolean>;
  }

  export interface WorkspaceConfiguration {
    get<T>(section: string, defaultValue?: T): T;
  }

  export interface WorkspaceFolder {
    readonly uri: Uri;
    readonly name: string;
    readonly index: number;
  }

  export namespace workspace {
    export const workspaceFolders: readonly WorkspaceFolder[] | undefined;
    export function findFiles(
      include: string,
      exclude?: string | null,
      maxResults?: number
    ): Thenable<Uri[]>;
    export function openTextDocument(uri: Uri): Thenable<TextDocument>;
    export function getConfiguration(section?: string): WorkspaceConfiguration;
    export function asRelativePath(
      pathOrUri: string | Uri,
      includeWorkspaceFolder?: boolean
    ): string;

    export namespace fs {
      export function stat(
        uri: Uri
      ): Thenable<{ type: FileType; size: number }>;
      export function readFile(uri: Uri): Thenable<Uint8Array>;
    }
  }

  export namespace languages {
    export function getDiagnostics(): Array<[Uri, Diagnostic[]]>;
  }

  export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
  }

  export interface StatusBarItem {
    text: string;
    tooltip?: string;
    command?: string;
    show(): void;
    dispose(): void;
  }

  export interface Webview {
    options: { enableScripts?: boolean };
    html: string;
    postMessage(message: unknown): Thenable<boolean>;
    onDidReceiveMessage(
      listener: (e: unknown) => unknown
    ): { dispose(): void };
  }

  export interface WebviewView {
    readonly webview: Webview;
  }

  export interface WebviewViewProvider {
    resolveWebviewView(webviewView: WebviewView): void | Thenable<void>;
  }

  export interface TextEditor {
    readonly document: TextDocument;
    readonly selection: Selection;
  }

  export namespace window {
    export const activeTextEditor: TextEditor | undefined;
    export function showInformationMessage(
      message: string,
      ...items: any[]
    ): Thenable<string | undefined>;
    export function showWarningMessage(
      message: string,
      ...items: any[]
    ): Thenable<string | undefined>;
    export function showErrorMessage(
      message: string,
      ...items: any[]
    ): Thenable<string | undefined>;
    export function showInputBox(options?: {
      prompt?: string;
      value?: string;
      password?: boolean;
      ignoreFocusOut?: boolean;
    }): Thenable<string | undefined>;
    export function showTextDocument(
      document: TextDocument,
      column?: number,
      preserveFocus?: boolean
    ): Thenable<TextEditor>;
    export function createStatusBarItem(
      alignment?: StatusBarAlignment,
      priority?: number
    ): StatusBarItem;
    export function registerWebviewViewProvider(
      viewId: string,
      provider: WebviewViewProvider,
      options?: { webviewOptions?: { retainContextWhenHidden?: boolean } }
    ): { dispose(): void };
    export function registerTreeDataProvider<T>(
      viewId: string,
      treeDataProvider: TreeDataProvider<T>
    ): { dispose(): void };
  }

  export namespace commands {
    export function registerCommand(
      command: string,
      callback: (...args: any[]) => any
    ): { dispose(): void };
    export function executeCommand<T = unknown>(
      command: string,
      ...rest: any[]
    ): Thenable<T>;
  }

  export interface SecretStorage {
    get(key: string): Thenable<string | undefined>;
    store(key: string, value: string): Thenable<void>;
    delete(key: string): Thenable<void>;
  }

  export interface ExtensionContext {
    readonly subscriptions: Array<{ dispose(): any }>;
    readonly secrets: SecretStorage;
  }
}
