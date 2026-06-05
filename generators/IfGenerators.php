<?php

namespace Generators;

class IfGenerators
{
    public static function generate(): array
    {
        return [
            'label' => 'if',
            'kind' => 'snippet',
            'insertText' => <<<'PHP'
if ($${1:patrickNo}) {
    echo $${1:patrickNo};
}
PHP
        ];
    }
}