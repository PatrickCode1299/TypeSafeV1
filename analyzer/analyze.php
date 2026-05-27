<?php

require __DIR__ . '/../vendor/autoload.php';

use PhpParser\Node;
use PhpParser\ParserFactory;
use PhpParser\NodeTraverser;
use PhpParser\NodeVisitorAbstract;

// ======================================================
// READ INPUT
// ======================================================

$code = file_get_contents("php://stdin");

$factory = new ParserFactory();
$parser = $factory->createForNewestSupportedVersion();

$lines = explode("\n", $code);

$diagnostics = [];

// ======================================================
// SEMICOLON CHECK
// ======================================================

$semicolonDiagnostics = checkMissingSemicolon($lines);

$diagnostics = array_merge(
    $diagnostics,
    $semicolonDiagnostics
);

// ======================================================
// PARSE PHP
// ======================================================

try {

    $ast = $parser->parse($code);

} catch (Throwable $e) {

    echo json_encode([
        'line' => 1,
        'start' => 0,
        'end' => 1,
        'message' => $e->getMessage(),
        'severity' => 'error'
    ]) . PHP_EOL;

    exit;
}

// ======================================================
// VARIABLE VISITOR
// ======================================================

class VariableVisitor extends NodeVisitorAbstract
{
    public array $declared = [];

    public array $used = [];

    public function enterNode(Node $node)
    {
        // ==========================================
        // VARIABLE DECLARATION
        // ==========================================

        if (
            $node instanceof Node\Expr\Assign &&
            $node->var instanceof Node\Expr\Variable &&
            is_string($node->var->name)
        ) {

            $this->declared[$node->var->name] = [
                'line' => $node->getStartLine(),
                'start' => $node->var->getStartFilePos(),
                'end' => $node->var->getEndFilePos()
            ];
        }

        // ==========================================
        // VARIABLE USAGE
        // ==========================================

        if (
            $node instanceof Node\Expr\Variable &&
            is_string($node->name)
        ) {

            $this->used[] = $node->name;
        }
    }
}

// ======================================================
// TRAVERSE AST
// ======================================================

$visitor = new VariableVisitor();

$traverser = new NodeTraverser();

$traverser->addVisitor($visitor);

$traverser->traverse($ast);

// ======================================================
// UNUSED VARIABLE CHECK
// ======================================================

foreach ($visitor->declared as $name => $meta) {

    $count = count(array_keys($visitor->used, $name));

    if ($count <= 1) {

        $diagnostics[] = [
            'line' => $meta['line'],
            'start' => $meta['start'],
            'end' => $meta['end'],
            'message' => "Unused variable \$$name",
            'severity' => 'warning',
            'unnecessary' => true
        ];
    }
}

// ======================================================
// OUTPUT ALL DIAGNOSTICS
// ======================================================

foreach ($diagnostics as $diagnostic) {
    echo json_encode($diagnostic) . PHP_EOL;
}

// ======================================================
// FUNCTIONS
// ======================================================

function checkMissingSemicolon(array $lines): array
{
    $diagnostics = [];

    foreach ($lines as $index => $line) {

        $trimmed = trim($line);

        // ==========================================
        // SKIP EMPTY
        // ==========================================

        if ($trimmed === '') {
            continue;
        }

        // ==========================================
        // SKIP COMMENTS
        // ==========================================

        if (
            str_starts_with($trimmed, '//') ||
            str_starts_with($trimmed, '#') ||
            str_starts_with($trimmed, '/*') ||
            str_starts_with($trimmed, '*')
        ) {
            continue;
        }

        // ==========================================
        // SKIP BLOCK STRUCTURES
        // ==========================================

        if (
            str_ends_with($trimmed, '[') ||
            str_ends_with($trimmed, '(') ||
            str_ends_with($trimmed, '{') ||
            $trimmed === ']' ||
            $trimmed === ')' ||
            $trimmed === '}'
        ) {
            continue;
        }

        // ==========================================
        // VALID ENDINGS
        // ==========================================

        if (
            str_ends_with($trimmed, ';') ||
            str_ends_with($trimmed, ',') ||
            str_ends_with($trimmed, ':')
        ) {
            continue;
        }

        // ==========================================
        // DETECT METHOD CALLS
        // $this->run()
        // foo()
        // ==========================================

        $isMethodCall =
            preg_match('/\)\s*$/', $trimmed);

        // ==========================================
        // DETECT SIMPLE ASSIGNMENTS
        // $name = "Patrick"
        // ==========================================

        $isSimpleAssignment =
            preg_match(
                '/^\$[a-zA-Z_][a-zA-Z0-9_]*\s*=.+$/',
                $trimmed
            );

        // ==========================================
        // DETECT RETURN STATEMENTS
        // ==========================================

        $isReturn =
            preg_match('/^return\s+.+$/', $trimmed);

        // ==========================================
        // ONLY FLAG SAFE CASES
        // ==========================================

        if (
            $isMethodCall ||
            $isSimpleAssignment ||
            $isReturn
        ) {

            $diagnostics[] = [
                'line' => $index + 1,
                'start' => max(strlen($trimmed) - 1, 0),
                'end' => strlen($trimmed),
                'message' => 'Missing semicolon',
                'severity' => 'warning',
                'code' => 'missing-semicolon'
            ];
        }
    }

    return $diagnostics;
}