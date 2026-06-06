import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const collection =
    vscode.languages.createDiagnosticCollection('typesafe-php');

let timeout: NodeJS.Timeout | undefined;

// ======================================================
// STATE LOCK (IMPORTANT FIX)
// ======================================================
let isApplyingEdit = false;

// ======================================================
// SNIPPET CACHE
// ======================================================
const snippetCache = new Map<string, vscode.CompletionItem[]>();

export function activate(context: vscode.ExtensionContext) {

    console.log("🔥 TYPESAFE PHP ACTIVE (FINAL STABLE)");

    const scriptPath = path.join(
        context.extensionPath,
        'analyzer',
        'analyze.php'
    );

    if (!fs.existsSync(scriptPath)) {
        console.error("❌ analyzer not found:", scriptPath);
        return;
    }

    context.subscriptions.push(collection);

    // ======================================================
    // SNIPPET GENERATOR (UNCHANGED)
    // ======================================================
    function generateSnippets(document: vscode.TextDocument): vscode.CompletionItem[] {

        const lines = document.getText().split('\n');
        const snippets: vscode.CompletionItem[] = [];

        for (const rawLine of lines) {

            const line = rawLine.trim();

            switch (line) {

                case '//class': {
                    const item = new vscode.CompletionItem('class', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`class \${1:ClassName}
{
    private int \${2:property};

    public function __construct(int \$\${2:property})
    {
        \$this->\${2:property} = \${2:property};
    }
}`
                    );
                    snippets.push(item);
                    break;
                }

                case '//function': {
                    const item = new vscode.CompletionItem('function', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`function \${1:name}(int \$\${2:param}): int
{
    return \$\${2:param};
}`
                    );
                    snippets.push(item);
                    break;
                }

                case '//if': {
                    const item = new vscode.CompletionItem('if', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`if (\${1:condition}) {
    echo \${1:condition};
}`
                    );
                    snippets.push(item);
                    break;
                }

                case '//public method': {
                    const item = new vscode.CompletionItem('public method', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`public function \${1:name}(int \$\${2:param}): int
{
    return \$\${2:param};
}`
                    );
                    snippets.push(item);
                    break;
                }

                case '//private method': {
                    const item = new vscode.CompletionItem('private method', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`private function \${1:name}(int \$\${2:param}): int
{
    return \$\${2:param};
}`
                    );
                    snippets.push(item);
                    break;
                }
            }
        }

        return snippets;
    }

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        'php',
        {
            provideCompletionItems(document) {
                return snippetCache.get(document.uri.fsPath) || [];
            }
        }
    );

    context.subscriptions.push(completionProvider);

    // ======================================================
    // 🧠 ALIAS ENGINE (STABLE + RELIABLE)
    // ======================================================
    async function writeAliasIntoFile(document: vscode.TextDocument, lineIndex: number) {

        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const lineText = document.lineAt(lineIndex).text.trim();

        let snippet: string | null = null;

        switch (lineText) {

            case '//function':
                snippet = `function \${1:name}(): void
{
    $0
}`;
                break;

            case '//class':
                snippet = `class \${1:ClassName}
{
    private int \${2:property};

    public function __construct(int \$\${2:property})
    {
        \$this->\${2:property} = \${2:property};
    }
}`;
                break;

            case '//if':
                snippet = `if (\${1:condition}) {
    $0
}`;
                break;

            case '//public method':
                snippet = `public function \${1:name}(): void
{
    $0
}`;
                break;

            case '//private method':
                snippet = `private function \${1:name}(): void
{
    $0
}`;
                break;
        }

        if (!snippet) return;

        isApplyingEdit = true;

        const edit = new vscode.WorkspaceEdit();
        const range = document.lineAt(lineIndex).range;

        edit.delete(document.uri, range);

        await vscode.workspace.applyEdit(edit);

        await vscode.commands.executeCommand('editor.action.insertSnippet', {
            snippet
        });

        setTimeout(() => {
            isApplyingEdit = false;
            analyzeDocument(document);
        }, 120);
    }

    // ======================================================
    // UNUSED VARIABLE PURGE (UNCHANGED)
    // ======================================================
    const pendingUnusedDeletes = new Map<string, number>();

    vscode.workspace.onWillSaveTextDocument(async (event) => {

        const document = event.document;

        if (document.languageId !== 'php') return;

        const diagnostics = collection.get(document.uri) || [];

        const unusedVariables = diagnostics.filter(
            d => d.message.startsWith('Unused variable')
        );

        if (!unusedVariables.length) {
            pendingUnusedDeletes.clear();
            return;
        }

        const edit = new vscode.WorkspaceEdit();

        for (const diagnostic of unusedVariables) {

            const lineNumber = diagnostic.range.start.line;
            const key = `${document.uri.fsPath}:${lineNumber}`;

            const count = pendingUnusedDeletes.get(key) || 0;

            if (count === 0) {
                pendingUnusedDeletes.set(key, 1);
                vscode.window.setStatusBarMessage(
                    `⚠️ Unused variable detected. Save again to remove.`,
                    3000
                );
                continue;
            }

            const line = document.lineAt(lineNumber);

            if (/^\s*\$[a-zA-Z_][a-zA-Z0-9_]*\s*=/.test(line.text)) {
                edit.delete(document.uri, line.rangeIncludingLineBreak);
                pendingUnusedDeletes.delete(key);

                vscode.window.setStatusBarMessage(
                    `🧹 Removed unused variable`,
                    3000
                );
            }
        }

        await vscode.workspace.applyEdit(edit);
    });

    // ======================================================
    // 🧠 SINGLE UNIFIED CHANGE PIPELINE (FIXED)
    // ======================================================
    vscode.workspace.onDidChangeTextDocument(event => {

        if (isApplyingEdit) return;

        const document = event.document;
        if (document.languageId !== 'php') return;

        const change = event.contentChanges[0];
        if (!change) return;

        const lineIndex = change.range.start.line;
        const lineText = document.lineAt(lineIndex).text.trim();
        const trimmed = lineText.trim();

const looksLikeStatement =
    trimmed.startsWith('echo ') ||
    trimmed.startsWith('return ') ||
    trimmed.startsWith('die(') ||
    trimmed.startsWith('throw ') ||
    trimmed.includes('=') ||
    /\w+\(.*\)/.test(trimmed);
        // ============================
        // ALIAS DETECTION (FIXED)
        // ============================
        if (change.text.includes('\n')) {
            writeAliasIntoFile(document, lineIndex);
        }

        // ============================
        // SEMICOLON AUTO FIX
        // ============================
        if (change.text.includes('\n')) {

            if (
                lineText &&
                !lineText.endsWith(';') &&
                !lineText.endsWith('{') &&
                !lineText.endsWith('}') &&
                !lineText.startsWith('//') &&
                looksLikeStatement 
            ) {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return;

                const edit = new vscode.WorkspaceEdit();
                edit.insert(document.uri, new vscode.Position(lineIndex, document.lineAt(lineIndex).text.length), ';');

                vscode.workspace.applyEdit(edit);
            }
        }

        // ============================
        // SNIPPET CACHE UPDATE
        // ============================
        snippetCache.set(document.uri.fsPath, generateSnippets(document));

        // ============================
        // ANALYSIS DEBOUNCE (STABLE)
        // ============================
        if (timeout) clearTimeout(timeout);

        timeout = setTimeout(() => {
            analyzeDocument(document);
        }, 450);
    });

    // ======================================================
    // ANALYZER (UNCHANGED CORE LOGIC)
    // ======================================================
    function analyzeDocument(document: vscode.TextDocument) {

        if (isApplyingEdit) return;
        if (document.languageId !== 'php') return;

        const text = document.getText();
        if (!text.trim()) return;

        const child = spawn('php', [scriptPath], { shell: true });

        let output = '';
        let errorOutput = '';

        const killTimer = setTimeout(() => child.kill(), 8000);

        child.stdout.on('data', d => output += d.toString());
        child.stderr.on('data', d => errorOutput += d.toString());

        child.on('close', () => {

            clearTimeout(killTimer);

            const diagnostics: vscode.Diagnostic[] = [];

            const lines = output.split('\n').filter(Boolean);

            for (const line of lines) {

                try {
                    const result = JSON.parse(line);

                    const range = new vscode.Range(
                        (result.line ?? 1) - 1,
                        result.start ?? 0,
                        (result.line ?? 1) - 1,
                        result.end ?? 100
                    );

                    const severity =
                        result.severity === 'error'
                            ? vscode.DiagnosticSeverity.Error
                            : vscode.DiagnosticSeverity.Warning;

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        result.message,
                        severity
                    );

                    diagnostic.source = "TypeSafe PHP";

                    if (result.code === 'unused-variable') {
                        diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
                    }

                    diagnostics.push(diagnostic);

                } catch { }
            }

            collection.set(document.uri, diagnostics);

            snippetCache.set(document.uri.fsPath, generateSnippets(document));

            if (errorOutput.trim()) {
                console.log(errorOutput);
            }
        });

        child.stdin.write(text);
        child.stdin.end();
    }

    // ======================================================
    // ACTIVE FILE REFRESH
    // ======================================================
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) return;
        analyzeDocument(editor.document);
    });

    // ======================================================
    // CLEANUP
    // ======================================================
    vscode.workspace.onDidCloseTextDocument(doc => {
        collection.delete(doc.uri);
        snippetCache.delete(doc.uri.fsPath);
    });
}

export function deactivate() {
    console.log("🛑 TYPESAFE PHP STOPPED");
}