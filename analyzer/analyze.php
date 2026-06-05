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
// LINE-BASED RULES (SAFE ONLY)
// ======================================================

$diagnostics = array_merge(
    $diagnostics,
    checkMissingSemicolon($lines)
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
        'severity' => 'error',
        'code' => 'syntax-error'
    ]) . PHP_EOL;

    exit;
}

// ======================================================
// VARIABLE + FLOW VISITOR
// ======================================================

class AnalyzerVisitor extends NodeVisitorAbstract
{
    public array $declared = [];
    public array $used = [];

    public array $emptyBlocks = [];
    public array $functions = [];

    public function enterNode(Node $node)
    {
        // ============================
        // VARIABLE DECLARATION
        // ============================
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

        // ============================
        // VARIABLE USAGE
        // ============================
        if (
            $node instanceof Node\Expr\Variable &&
            is_string($node->name)
        ) {
            $this->used[] = $node->name;
        }

        // ============================
        // EMPTY IF
        // ============================
        if ($node instanceof Node\Stmt\If_) {
            if (empty($node->stmts)) {
                $this->emptyBlocks[] = [
                    'line' => $node->getStartLine(),
                    'message' => 'Empty if statement block',
                    'code' => 'empty-if'
                ];
            }
        }

        // ============================
        // EMPTY FOREACH
        // ============================
        if ($node instanceof Node\Stmt\Foreach_) {
            if (empty($node->stmts)) {
                $this->emptyBlocks[] = [
                    'line' => $node->getStartLine(),
                    'message' => 'Empty foreach loop block',
                    'code' => 'empty-foreach'
                ];
            }
        }

        // ============================
        // EMPTY WHILE
        // ============================
        if ($node instanceof Node\Stmt\While_) {
            if (empty($node->stmts)) {
                $this->emptyBlocks[] = [
                    'line' => $node->getStartLine(),
                    'message' => 'Empty while loop block',
                    'code' => 'empty-while'
                ];
            }
        }

        // ============================
        // FUNCTION TRACKING
        // ============================
        if ($node instanceof Node\Stmt\Function_) {
            $this->functions[] = (string) $node->name;
        }
    }
   
}

// ======================================================
// RUN TRAVERSER
// ======================================================

$visitor = new AnalyzerVisitor();

$traverser = new NodeTraverser();
$traverser->addVisitor($visitor);
$traverser->traverse($ast);

// ======================================================
// UNUSED VARIABLE (WARNING)
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
            'code' => 'unused-variable',
            'unnecessary' => true
        ];
    }
}

// ======================================================
// UNDEFINED VARIABLE (CRITICAL)
// ======================================================

$usedVars = array_unique($visitor->used);

foreach ($usedVars as $used) {

    if (!isset($visitor->declared[$used])) {

        $diagnostics[] = [
            'line' => 1,
            'start' => 0,5,
            'end' => 20,
            'message' => "Undefined variable \$$used",
            'severity' => 'error',
            'code' => 'undefined-variable'
        ];
    }
}

// ======================================================
// EMPTY BLOCKS (CRITICAL)
// ======================================================

foreach ($visitor->emptyBlocks as $block) {

    $diagnostics[] = [
        'line' => $block['line'],
        'start' => 0,
        'end' => 10,
        'message' => $block['message'],
        'severity' => 'error',
        'code' => $block['code']
    ];
}

// ======================================================
// OUTPUT
// ======================================================

foreach ($diagnostics as $diagnostic) {
    echo json_encode($diagnostic) . PHP_EOL;
}

// ======================================================
// SEMICOLON CHECK (SAFE VERSION)
// ======================================================

function checkMissingSemicolon(array $lines): array
{
    $diagnostics = [];

    $paren = 0;
    $bracket = 0;
    $brace = 0;

    foreach ($lines as $index => $line) {

        $trimmed = trim($line);

        if ($trimmed === '') continue;

        // track structure state
        $paren += substr_count($line, '(') - substr_count($line, ')');
        $bracket += substr_count($line, '[') - substr_count($line, ']');
        $brace += substr_count($line, '{') - substr_count($line, '}');

        // skip comments
        if (
            str_starts_with($trimmed, '//') ||
            str_starts_with($trimmed, '#') ||
            str_starts_with($trimmed, '/*') ||
            str_starts_with($trimmed, '*')
        ) {
            continue;
        }

        // skip inside structures (IMPORTANT FIX)
        if ($paren > 0 || $bracket > 0 || $brace > 0) {
            continue;
        }

        // valid endings
        if (
            str_ends_with($trimmed, ';') ||
            str_ends_with($trimmed, ',') ||
            str_ends_with($trimmed, ':')
        ) {
            continue;
        }

        // method call / assignment / return
        $isMethodCall = preg_match('/\)\s*$/', $trimmed);
        $isAssignment = preg_match('/^\$[a-zA-Z_][a-zA-Z0-9_]*\s*=.+$/', $trimmed);
        $isReturn = preg_match('/^return\s+.+$/', $trimmed);

        if ($isMethodCall || $isAssignment || $isReturn) {

            $diagnostics[] = [
                'line' => $index + 1,
                'start' => 0,
                'end' => strlen($trimmed),
                'message' => 'Missing semicolon',
                'severity' => 'warning',
                'code' => 'missing-semicolon'
            ];
        }
    }

    return $diagnostics;
}

