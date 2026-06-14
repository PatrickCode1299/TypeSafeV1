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
// SAFE LINE RULES
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
// VISITOR
// ======================================================

class AnalyzerVisitor extends NodeVisitorAbstract
{
    public array $declared = [];
    public array $used = [];
    public array $emptyBlocks = [];

    public array $functions = [];
    public array $functionCalls = [];

    public function enterNode(Node $node)
    {
        // =========================
        // VARIABLE ASSIGNMENT
        // =========================
        if (
            $node instanceof Node\Expr\Assign &&
            $node->var instanceof Node\Expr\Variable &&
            is_string($node->var->name)
        ) {
            $this->declared[$node->var->name] = [
                'line' => $node->getStartLine(),
                'start' => $node->var->getStartFilePos(),
                'end' => $node->var->getEndFilePos(),
                'type' => 'var'
            ];
        }

        // =========================
        // FUNCTION PARAMS
        // =========================
        if ($node instanceof Node\Param && $node->var instanceof Node\Expr\Variable) {
            $name = $node->var->name;

            if (is_string($name)) {
                $this->declared[$name] = [
                    'line' => $node->getStartLine(),
                    'type' => 'param'
                ];
            }
        }

        // =========================
        // IGNORE $this
        // =========================
        if ($node instanceof Node\Expr\Variable) {
            if (is_string($node->name) && $node->name === 'this') {
                return;
            }

            if (is_string($node->name)) {
                $this->used[] = $node->name;
            }
        }

        // =========================
        // CLASS PROPERTIES
        // =========================
        if ($node instanceof Node\Stmt\PropertyProperty) {
            $this->declared[$node->name->name] = [
                'line' => $node->getStartLine(),
                'type' => 'property'
            ];
        }

        // =========================
        // PROPERTY USAGE ($this->x)
        // =========================
        if ($node instanceof Node\Expr\PropertyFetch) {
            if ($node->name instanceof Node\Identifier) {
                $this->used[] = '__prop:' . $node->name->name;
            }
        }

        // =========================
        // FUNCTIONS
        // =========================
        if ($node instanceof Node\Stmt\Function_) {
            $name = (string) $node->name;

            $this->functions[$name] = [
                'params' => count($node->params),
                'line' => $node->getStartLine()
            ];
        }

        // =========================
        // CONSTRUCTOR
        // =========================
        if ($node instanceof Node\Stmt\ClassMethod) {
            if ($node->name->name === '__construct') {
                $this->functions['__construct'] = [
                    'params' => count($node->params),
                    'line' => $node->getStartLine()
                ];
            }
        }

        // =========================
        // FUNCTION CALLS
        // =========================
        if ($node instanceof Node\Expr\FuncCall) {
            if ($node->name instanceof Node\Name) {
                $name = (string) $node->name;
                $this->functionCalls[$name] = count($node->args);
            }
        }

        // =========================
        // NEW CLASS CALL
        // =========================
        if ($node instanceof Node\Expr\New_) {
            if ($node->class instanceof Node\Name) {
                $className = (string) $node->class;
                $this->functionCalls[$className] = count($node->args);
            }
        }

        // =========================
        // EMPTY BLOCKS
        // =========================
        if ($node instanceof Node\Stmt\If_) {
            if (empty($node->stmts)) {
                $this->emptyBlocks[] = [
                    'line' => $node->getStartLine(),
                    'message' => 'Empty if statement block',
                    'code' => 'empty-if'
                ];
            }
        }

        if ($node instanceof Node\Stmt\Foreach_) {
            if (empty($node->stmts)) {
                $this->emptyBlocks[] = [
                    'line' => $node->getStartLine(),
                    'message' => 'Empty foreach loop block',
                    'code' => 'empty-foreach'
                ];
            }
        }

        if ($node instanceof Node\Stmt\While_) {
            if (empty($node->stmts)) {
                $this->emptyBlocks[] = [
                    'line' => $node->getStartLine(),
                    'message' => 'Empty while loop block',
                    'code' => 'empty-while'
                ];
            }
        }
    }
}

// ======================================================
// RUN VISITOR
// ======================================================

$visitor = new AnalyzerVisitor();

$traverser = new NodeTraverser();
$traverser->addVisitor($visitor);
$traverser->traverse($ast);

// ======================================================
// UNUSED VARIABLES
// ======================================================

foreach ($visitor->declared as $name => $meta) {

    $count = count(array_keys($visitor->used, $name));

    if ($count <= 1) {
        $diagnostics[] = [
            'line' => $meta['line'],
            'start' => $meta['start'] ?? 0,
            'end' => $meta['end'] ?? 0,
            'message' => "Unused variable \$$name",
            'severity' => 'warning',
            'code' => 'unused-variable'
        ];
    }
}

// ======================================================
// FUNCTION ARG CHECK
// ======================================================

foreach ($visitor->functions as $name => $meta) {

    if (!isset($visitor->functionCalls[$name])) {
        continue;
    }

    if ($visitor->functionCalls[$name] < $meta['params']) {
        $diagnostics[] = [
            'line' => $meta['line'],
            'start' => 0,
            'end' => 80,
            'message' => "Function '$name' expects {$meta['params']} argument(s)",
            'severity' => 'warning',
            'code' => 'missing-arguments'
        ];
    }
}

// ======================================================
// UNDEFINED VARIABLES
// ======================================================

$usedVars = array_unique($visitor->used);

foreach ($usedVars as $used) {

    if ($used === 'this') {
        continue;
    }

    if (str_starts_with($used, '__prop:')) {
        continue;
    }

    if (!isset($visitor->declared[$used])) {
        $diagnostics[] = [
            'line' => 1,
            'start' => 0,
            'end' => 20,
            'message' => "Undefined variable \$$used",
            'severity' => 'error',
            'code' => 'undefined-variable'
        ];
    }
}

// ======================================================
// EMPTY BLOCKS OUTPUT
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
// SEMICOLON CHECK
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

        $paren += substr_count($line, '(') - substr_count($line, ')');
        $bracket += substr_count($line, '[') - substr_count($line, ']');
        $brace += substr_count($line, '{') - substr_count($line, '}');

        if (
            str_starts_with($trimmed, '//') ||
            str_starts_with($trimmed, '#')
        ) {
            continue;
        }

        if ($paren > 0 || $brace > 0 || $bracket > 0) {
            continue;
        }

        if (
            str_ends_with($trimmed, ';') ||
            str_ends_with($trimmed, ',') ||
            str_ends_with($trimmed, ':')
        ) {
            continue;
        }

        $isCall = preg_match('/\)\s*$/', $trimmed);
        $isAssign = preg_match('/^\$[a-zA-Z_]/', $trimmed);

        if ($isCall || $isAssign) {
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