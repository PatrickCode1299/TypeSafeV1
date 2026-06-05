<?php

namespace Generators;

class FunctionGenerators
{
    public static function generate(): array
    {
        return [
            'type' => 'snippet',
            'trigger' => 'function',
            'content' => <<<'PHP'
function callPatrickExample(int $patrickNo): int
{
    return $patrickNo;
}
PHP
        ];
    }
}