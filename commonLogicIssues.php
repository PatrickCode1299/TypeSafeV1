<?php
//You can't use undefined variables, you automatically get an error
echo $patrick;
//You need to use PatrickAge for TypeSafe php not to catch it, if you do not use it gets removed on second save

$numbers = [10,20,30,40];

foreach($numbers as $number){
//You have to declare something for TypeSafe extension to not clear this as a bug
}

$x = true;

if($x){
//You have to declare something for TypeSafe extension to not clear this as a bug
}
//first save 

//second save patrickAge variable is gone because it wasn't used.

//Thanks for watching!!!


