<?php

// Load Composer autoload file so we can use installed packages (like PHP-Parser)
require __DIR__ . '/../vendor/autoload.php';

// Import required classes from PHP-Parser library
use PhpParser\Node; // Represents elements of PHP code (variables, functions, etc.)
use PhpParser\ParserFactory; // Creates a PHP parser instance
use PhpParser\NodeTraverser; // Walks through the AST tree
use PhpParser\NodeVisitorAbstract; // Base class for visiting AST nodes



// Read raw PHP code coming from STDIN (sent by VS Code extension)
$code = file_get_contents("php://stdin");

// Create a PHP parser (PREFER_PHP7 supports modern PHP syntax)
$factory = new ParserFactory();
$parser = $factory->createForNewestSupportedVersion();

try {
    // Try to convert PHP code into an Abstract Syntax Tree (AST)
    $ast = $parser->parse($code);

} catch (Throwable $e) {
    // If parsing fails (syntax error, invalid PHP), send error back to VS Code

    echo json_encode([
        'line' => 1, // fallback line number
        'start' => 0,
        'end' => 1,
        'message' => $e->getMessage(), // actual PHP error message
        'severity' => 'error'
    ]) . PHP_EOL;

    exit; // stop execution since code is invalid
}

// Custom visitor class that will inspect each node in the AST
class VariableVisitor extends NodeVisitorAbstract
{
    // Store variables that are declared (e.g. $name = ...)
    public array $declared = [];

    // Store variables that are used (e.g. echo $name)
    public array $used = [];

    // Called automatically for every node in the AST
    public function enterNode(Node $node)
    {
        // Detect variable assignment (e.g. $name = "John")
        if (
            $node instanceof Node\Expr\Assign && // it's an assignment
            $node->var instanceof Node\Expr\Variable && // left side is a variable
            is_string($node->var->name) // variable has a simple name
        ) {

            // Store declared variable name + position info
            $this->declared[$node->var->name] = [
                'line' => $node->getStartLine(), // line number in file
                'start' => $node->getStartFilePos(), // start position in file
                'end' => $node->getEndFilePos() // end position in file
            ];
        }

        // Detect variable usage (e.g. echo $name)
        if (
            $node instanceof Node\Expr\Variable && // variable node
            is_string($node->name) // ensure it's a simple variable name
        ) {
            // Store used variable name
            $this->used[] = $node->name;
        }
    }
}

// Create instance of our visitor
$visitor = new VariableVisitor();

// Create traverser to walk through AST tree
$traverser = new NodeTraverser();

// Attach our visitor to the traverser
$traverser->addVisitor($visitor);

// Start traversing the AST (this triggers enterNode for every node)
$traverser->traverse($ast);

// Now check all declared variables
foreach ($visitor->declared as $name => $meta) {

    // Count how many times variable appears in "used" list
    $count = count(array_keys($visitor->used, $name));

    // If variable is never used (or only appears once due to declaration edge case)
    if ($count <= 1) {

        // Send warning back to VS Code
        echo json_encode([
            'line' => $meta['line'], // where variable was declared
            'start' => 0,
            'end' => 100, // highlight range (can be improved later)
            'message' => "Unused variable \$$name", // warning message
            'severity' => 'warning',
            'unnecessary' => true // tells VS Code to fade/dim it
        ]) . PHP_EOL;
    }
}