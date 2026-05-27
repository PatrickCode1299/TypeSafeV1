import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const collection =
    vscode.languages.createDiagnosticCollection('typesafe-php');

let timeout: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {

    console.log("🔥 HELLO FROM TYPESAFE PHP");

    const scriptPath = path.join(
        context.extensionPath,
        'analyzer',
        'analyze.php'
    );

    console.log("📍 Analyzer path:", scriptPath);

    if (!fs.existsSync(scriptPath)) {
        console.error("❌ analyzer not found:", scriptPath);
        return;
    }

    context.subscriptions.push(collection);

    // ======================================================
    // SAVE LOGIC (2-step unused variable delete system)
    // ======================================================
    const pendingUnusedDeletes = new Map<string, number>();

    vscode.workspace.onWillSaveTextDocument(async (event) => {

        const document = event.document;

        if (document.languageId !== 'php') return;

        const diagnostics = collection.get(document.uri) || [];

        const unusedVariables = diagnostics.filter(
            d => d.message.startsWith('Unused variable')
        );

        if (unusedVariables.length === 0) {
            pendingUnusedDeletes.clear();
            return;
        }

        const edit = new vscode.WorkspaceEdit();

        for (const diagnostic of unusedVariables) {

            const lineNumber = diagnostic.range.start.line;

            const key = `${document.uri.fsPath}:${lineNumber}`;

            const count = pendingUnusedDeletes.get(key) || 0;

            // ============================
            // FIRST SAVE → WARN ONLY
            // ============================
            if (count === 0) {
                pendingUnusedDeletes.set(key, 1);

                vscode.window.setStatusBarMessage(
                    `⚠️ Unused variable detected. Save again to remove.`,
                    3000
                );

                continue;
            }

            // ============================
            // SECOND SAVE → DELETE
            // ============================
            const line = document.lineAt(lineNumber);
            const lineText = line.text;

            // safety: only delete simple assignments
            if (/^\s*\$[a-zA-Z_][a-zA-Z0-9_]*\s*=/.test(lineText)) {

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
    // SMART SEMICOLON INSERT (on ENTER)
    // ======================================================
    vscode.workspace.onDidChangeTextDocument(async (event) => {

        const document = event.document;

        if (document.languageId !== 'php') return;

        const changes = event.contentChanges;

        if (!changes.length) return;

        const lastChange = changes[0];

        if (!lastChange.text.includes('\n')) return;

        const lineIndex = lastChange.range.start.line;

        const lineText = document.lineAt(lineIndex).text;
        const trimmed = lineText.trim();

        if (!trimmed) return;

        // skip valid endings
        if (
            trimmed.endsWith(';') ||
            trimmed.endsWith('{') ||
            trimmed.endsWith('}') ||
            trimmed.endsWith(':')
        ) return;

        // skip comments
        if (trimmed.startsWith('//')) return;

        // must be statement-like
        const looksLikeStatement =
            trimmed.includes('=') ||
            /\w+\(.*\)/.test(trimmed);

        if (!looksLikeStatement) return;

        const editor = vscode.window.activeTextEditor;

        if (!editor) return;

        const position = new vscode.Position(
            lineIndex,
            lineText.length
        );

        const edit = new vscode.WorkspaceEdit();

        edit.insert(document.uri, position, ';');

        await vscode.workspace.applyEdit(edit);
    });

    // ======================================================
    // ANALYZER
    // ======================================================
    function analyzeDocument(document: vscode.TextDocument) {

        if (document.languageId !== 'php') return;

        const text = document.getText();
        if (!text.trim()) return;

        const child = spawn('php', [scriptPath], {
            shell: true
        });

        let output = '';
        let errorOutput = '';

        const killTimer = setTimeout(() => {
            child.kill();
            console.log("⏱️ Analyzer timeout (killed process)");
        }, 8000);

        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        child.on('error', (err) => {
            console.error("❌ spawn error:", err.message);
        });

        child.on('close', () => {

            clearTimeout(killTimer);

            const diagnostics: vscode.Diagnostic[] = [];

            const lines = output.split('\n').filter(l => l.trim());

            for (const line of lines) {

                try {
                    const result = JSON.parse(line);

                    const range = new vscode.Range(
                        (result.line ?? 1) - 1,
                        result.start ?? 0,
                        (result.line ?? 1) - 1,
                        result.end ?? 100
                    );

                    // ============================
                    // SEVERITY MAPPING
                    // ============================
                    let severity: vscode.DiagnosticSeverity;

                    switch (result.severity) {
                        case 'error':
                            severity = vscode.DiagnosticSeverity.Error; // 🔴
                            break;
                        default:
                            severity = vscode.DiagnosticSeverity.Warning; // 🟡
                            break;
                    }

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        result.message,
                        severity
                    );

                    diagnostic.source = "TypeSafe PHP";

                    if (result.code) {
                        diagnostic.code = result.code;
                    }

                    if (result.code === 'unused-variable') {
                        diagnostic.tags = [
                            vscode.DiagnosticTag.Unnecessary
                        ];
                    }

                    diagnostics.push(diagnostic);

                } catch {
                    console.log("❌ Non-JSON line:", line);
                }
            }

            collection.set(document.uri, diagnostics);

            if (errorOutput.trim()) {
                console.log("⚠️ stderr:", errorOutput);
            }
        });

        child.stdin.write(text);
        child.stdin.end();
    }

    // ======================================================
    // DEBOUNCE ANALYSIS
    // ======================================================
    vscode.workspace.onDidChangeTextDocument(event => {

        if (timeout) clearTimeout(timeout);

        timeout = setTimeout(() => {
            analyzeDocument(event.document);
        }, 400);
    });

    // ======================================================
    // ACTIVE FILE SWITCH
    // ======================================================
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) return;
        analyzeDocument(editor.document);
    });

    // ======================================================
    // CLEANUP
    // ======================================================
    vscode.workspace.onDidCloseTextDocument(document => {
        collection.delete(document.uri);
    });
}

export function deactivate() {
    console.log("🛑 TypeSafe PHP deactivated");
}