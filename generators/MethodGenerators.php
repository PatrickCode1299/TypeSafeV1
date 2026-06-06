<?php

namespace Generators;

class MethodGenerators
{
    public static function public(): array
    {
        return [
            'label' => 'public method',
            'kind' => 'snippet',
            'insertText' => <<<'PHP'
public function ${1:callPatrickExample}(int $${2:patrickNo}): int
{
    return $${2:patrickNo};
}
PHP
        ];
    }

    public static function private(): array
    {
        return [
            'label' => 'private method',
            'kind' => 'snippet',
            'insertText' => <<<'PHP'
private function ${1:callPatrickExample}(int $${2:patrickNo}): int
{
    return $${2:patrickNo};
}
PHP
        ];
    }
}