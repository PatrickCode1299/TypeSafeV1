<?php

namespace Generators;
use Generators\ClassGenerators;
use Generators\IfGenerators;
use Generators\MethodGenerators;
use Generators\FunctionGenerators;
class AliasGenerators
{
    public static function generate(string $line): ?string
    {
        $line = trim($line);

        return match ($line) {
            '//function'       => FunctionGenerators::generate(),
            '//public method'  => MethodGenerators::public(),
            '//private method' => MethodGenerators::private(),
            '//if'             => IfGenerators::generate(),
            '//class'          => ClassGenerators::generate(),
            default            => null
        };
    }
}