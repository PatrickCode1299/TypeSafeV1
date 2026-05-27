<?php
class Person{

public $name = "Patrick";
public $dog = "Scooby";

public function __construct($name, $dog)
{
    $this->name = $name;
    $this->dog = $dog;
}

public function showName():string{
    $lastName = "Daniel";

    return $this->name + $lastName;
}

}