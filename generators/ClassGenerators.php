<?php

namespace Generators;

class ClassGenerators
{
    public static function generate(): array
    {
        return [
            'type' => 'snippet',
            'trigger' => 'class',
            'content' => <<<'PHP'
class PatrickDetails
{
    private int $patrickNo;

    public function __construct(int $patrickNo)
    {
        $this->patrickNo = $patrickNo;
    }

    private function callPatrickExample(int $patrickNo): int
    {
        return $patrickNo;
    }
}
PHP
        ];
    }
}