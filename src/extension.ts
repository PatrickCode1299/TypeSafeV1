import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const collection = vscode.languages.createDiagnosticCollection('typesafe-php');

let timeout: NodeJS.Timeout | undefined;
let isApplyingEdit = false;

const snippetCache = new Map<string, vscode.CompletionItem[]>();

export function activate(context: vscode.ExtensionContext) {

    console.log("🔥 TYPESAFE PHP ACTIVE (FINAL MERGED EDITION)");

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
    // SNIPPET GENERATOR
    // ======================================================
    function generateSnippets(document: vscode.TextDocument): vscode.CompletionItem[] {

        const lines = document.getText().split('\n');
        const snippets: vscode.CompletionItem[] = [];

        for (const rawLine of lines) {

            const line = rawLine.trim();

            switch (line) {

                // CLASS
                case '//class': {
                    const item = new vscode.CompletionItem('class', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`class \${1:ClassName}
{
    private $\${2:property};

    public function __construct($\${2:property})
    {
        $this->\${2:property} = $\${2:property};
    }
}`
                    );
                    snippets.push(item);
                    break;
                }

                // FN
                case '//fn': {
                    const item = new vscode.CompletionItem('fn', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`function \${1:name}($\${2:param})
{
    return $\${2:param};
}`
                    );
                    snippets.push(item);
                    break;
                }

                // IF
                case '//if': {
                    const item = new vscode.CompletionItem('if', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`if ($\${1:condition}) {
    $0
}`
                    );
                    snippets.push(item);
                    break;
                }

                // WHILE
                case '//while': {
                    const item = new vscode.CompletionItem('while', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`while ($\${1:condition}) {
    $0
}`
                    );
                    snippets.push(item);
                    break;
                }

                // DO WHILE
                case '//do while': {
                    const item = new vscode.CompletionItem('do while', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`do {
    $0
} while ($\${1:condition});`
                    );
                    snippets.push(item);
                    break;
                }

                // ARRAY
                case '//array': {
                    const item = new vscode.CompletionItem('array', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`$\${1:items} = [];`
                    );
                    snippets.push(item);
                    break;
                }

                // FOREACH
                case '//each': {
                    const item = new vscode.CompletionItem('foreach', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`foreach ($\${1:items} as $\${2:item}) {
    $0
}`
                    );
                    snippets.push(item);
                    break;
                }

                // SWITCH
                case '//switch': {
                    const item = new vscode.CompletionItem('switch', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`switch ($\${1:value}) {
    case \${2:case}:
        break;
    default:
        break;
}`
                    );
                    snippets.push(item);
                    break;
                }

                // MATCH
                case '//match': {
                    const item = new vscode.CompletionItem('match', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`$\${1:result} = match ($\${2:value}) {
    \${3:condition} => \${4:result},
    default => \${5:default},
};`
                    );
                    snippets.push(item);
                    break;
                }

                // TRY
                case '//try': {
                    const item = new vscode.CompletionItem('try', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`try {
    $0
} catch (\\Exception $\${1:e}) {
    echo $\${1:e}->getMessage();
}`
                    );
                    snippets.push(item);
                    break;
                }

                // CONST
                case '//const': {
                    const item = new vscode.CompletionItem('const', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`const \${1:NAME} = \${2:value};`
                    );
                    snippets.push(item);
                    break;
                }

                // STATIC FN
                case '//static fn': {
                    const item = new vscode.CompletionItem('static fn', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`public static function \${1:name}()
{
    $0
}`
                    );
                    snippets.push(item);
                    break;
                }

                // METHODS
                case '//public method': {
                    const item = new vscode.CompletionItem('public method', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`public function \${1:name}($\${2:param})
{
    return $\${2:param};
}`
                    );
                    snippets.push(item);
                    break;
                }

                case '//private method': {
                    const item = new vscode.CompletionItem('private method', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`private function \${1:name}($\${2:param})
{
    return $\${2:param};
}`
                    );
                    snippets.push(item);
                    break;
                }

                // ENUM
                case '//enum': {
                    const item = new vscode.CompletionItem('enum', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`enum \${1:Status}
{
    case \${2:Active};
    case \${3:Inactive};
}`
                    );
                    snippets.push(item);
                    break;
                }

                case '//enum backed': {
                    const item = new vscode.CompletionItem('enum backed', vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(
`enum \${1:Status}: \${2:string}
{
    case \${3:Active} = '\${4:active}';
    case \${5:Inactive} = '\${6:inactive}';
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
    // ALIAS ENGINE (FULL RESTORED)
    // ======================================================
    async function writeAliasIntoFile(document: vscode.TextDocument, lineIndex: number) {

        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const lineText = document.lineAt(lineIndex).text.trim();

        let snippet: string | null = null;

        switch (lineText) {

            case '//class':
                snippet = `class \${1:ClassName}
{
    private $\${2:property};

    public function __construct($\${2:property})
    {
        $this->\${2:property} = $\${2:property};
    }
}`;
                break;

            case '//fn':
                snippet = `function \${1:name}($\${2:param})
{
    return $\${2:param};
}`;
                break;

            case '//if':
                snippet = `if ($\${1:condition}) {
    $0
}`;
                break;

            case '//while':
                snippet = `while ($\${1:condition}) {
    $0
}`;
                break;

            case '//do while':
                snippet = `do {
    $0
} while ($\${1:condition});`;
                break;

            case '//array':
                snippet = `$\${1:items} = [];`;
                break;

            case '//each':
                snippet = `foreach ($\${1:items} as $\${2:item}) {
    $0
}`;
                break;

            case '//switch':
                snippet = `switch ($\${1:value}) {
    case \${2:case}:
        break;
    default:
        break;
}`;
                break;

            case '//match':
                snippet = `$\${1:result} = match ($\${2:value}) {
    \${3:condition} => \${4:result},
    default => \${5:default},
};`;
                break;

            case '//try':
                snippet = `try {
    $0
} catch (\\Exception $\${1:e}) {
    echo $\${1:e}->getMessage();
}`;
                break;

            case '//const':
                snippet = `const \${1:NAME} = \${2:value};`;
                break;

            case '//static fn':
                snippet = `public static function \${1:name}()
{
    $0
}`;
                break;

            case '//public method':
                snippet = `public function \${1:name}($\${2:param})
{
    return $\${2:param};
}`;
                break;

            case '//private method':
                snippet = `private function \${1:name}($\${2:param})
{
    return $\${2:param};
}`;
                break;

            case '//enum':
                snippet = `enum \${1:Status}
{
    case \${2:Active};
    case \${3:Inactive};
}`;
                break;

            case '//enum backed':
                snippet = `enum \${1:Status}: \${2:string}
{
    case \${3:Active} = '\${4:active}';
    case \${5:Inactive} = '\${6:inactive}';
}`;
                break;
        }

        if (!snippet) return;

        isApplyingEdit = true;

        const range = document.lineAt(lineIndex).range;

        const edit = new vscode.WorkspaceEdit();
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
    // SEMICOLON FIX (RESTORED)
    // ======================================================
    function shouldAddSemicolon(line: string): boolean {
        const t = line.trim();

        if (!t) return false;
        if (t.startsWith('//')) return false;
        if (t.endsWith(';') || t.endsWith('{') || t.endsWith('}')) return false;

        return (
            t.startsWith('echo ') ||
            t.startsWith('return ') ||
            t.startsWith('throw ') ||
            t.startsWith('die(') ||
            t.includes('=') ||
            /\w+\(.*\)/.test(t)
        );
    }

    // ======================================================
    // PIPELINE (MERGED SAFE VERSION)
    // ======================================================
    vscode.workspace.onDidChangeTextDocument(event => {

        if (isApplyingEdit) return;

        const document = event.document;
        if (document.languageId !== 'php') return;

        const change = event.contentChanges[0];
        if (!change || !change.text.includes('\n')) return;

        const lineIndex = change.range.start.line;
        const lineText = document.lineAt(lineIndex).text;

        writeAliasIntoFile(document, lineIndex);

        if (shouldAddSemicolon(lineText)) {
            const edit = new vscode.WorkspaceEdit();
            edit.insert(
                document.uri,
                new vscode.Position(lineIndex, lineText.length),
                ';'
            );
            vscode.workspace.applyEdit(edit);
        }

        snippetCache.set(document.uri.fsPath, generateSnippets(document));

        if (timeout) clearTimeout(timeout);

        timeout = setTimeout(() => analyzeDocument(document), 450);
    });

    // ======================================================
    // ANALYZER (UNCHANGED)
    // ======================================================
    function analyzeDocument(document: vscode.TextDocument) {

        if (isApplyingEdit) return;

        const child = spawn('php', [scriptPath], { shell: true });

        let output = '';
        let errorOutput = '';

        const killTimer = setTimeout(() => child.kill(), 8000);

        child.stdout.on('data', d => output += d.toString());
        child.stderr.on('data', d => errorOutput += d.toString());

        child.on('close', () => {

            clearTimeout(killTimer);

            const diagnostics: vscode.Diagnostic[] = [];

            for (const line of output.split('\n')) {
                try {
                    const result = JSON.parse(line);

                    const range = new vscode.Range(
                        (result.line ?? 1) - 1,
                        result.start ?? 0,
                        (result.line ?? 1) - 1,
                        result.end ?? 100
                    );

                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            result.message,
                            result.severity === 'error'
                                ? vscode.DiagnosticSeverity.Error
                                : vscode.DiagnosticSeverity.Warning
                        )
                    );

                } catch {}
            }

            collection.set(document.uri, diagnostics);
            snippetCache.set(document.uri.fsPath, generateSnippets(document));
        });

        child.stdin.write(document.getText());
        child.stdin.end();
    }

    // ======================================================
    // EVENTS
    // ======================================================
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) analyzeDocument(editor.document);
    });

    vscode.workspace.onDidCloseTextDocument(doc => {
        collection.delete(doc.uri);
        snippetCache.delete(doc.uri.fsPath);
    });
}

export function deactivate() {
    console.log("🛑 TYPESAFE PHP STOPPED");
}