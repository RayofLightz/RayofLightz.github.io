---
layout: post
title: "Bite Sized Rust RE: 1 Deconstructing Hello World"
categories: re rust
---

# Bite Sized Rust RE: 1 Deconstructing Hello World

In this tutorial series I am going to attempt to introduce ways of reverse engineering programs that were written in the rust programming language
and to explain concepts in bite sized morsals. This means most example code in each tutorial will normally only consist of one to two functions that are program specific.

This is not a rust tutorial, that being said you don't have to be fluent in rust to understand most of these code examples.
I would recommend reading [the book](https://doc.rust-lang.org/book/) either before or alongside these tutorials.

I also assume that you have basic shell knowladge (IE you know how to create files and directories as well as how to navigate them) and
that you are ~~fairly~~ somewhat comfortable with reversing code written in C.

On a quick note I am currently compiling on x64 linux; with that said lets get started.

## Hello World

First to start of create a project directory and naviagte into it. From there you can run `cargo init`
which is kind enough to create a `src` directory with a `main.rs` that acts as a hello world example.

{% highlight rust %}

fn main() {
    println!("Hello, world!");
}

{% endhighlight %}

Compile this with `cargo build` and cargo will build your program and store it under `target/debug/`.
This can be run like any other program. Congrats you have a hello world.

## Disecting

Just rust's hello world shows us how a few code patterns end up looking when compiled in rust.
Namely how the program deals with entry points, functions, and macros. 

### Entry

First off I am going to open the binary up with radare2 and run `aaa` on it to do some basic analysis.
Then since cargo's debug build has symbols we can just search for a main function by running `afl~main`.

In the case of my program it returns the following 

```
0x00004350    1 55           sym.rev::main::hf8bea8ba77115bd1
0x00004390    1 47           main
```

Not I also searched for `entry` which is nearly identical to a normal libc entry point

Lets look at the disassembly of the plain main function (Taken from r2 using pdb).

```
/ 47: int main (int argc, char **argv, char **envp);
|           ; var int32_t var_fh @ rsp+0xf
|           ; var char **var_10h @ rsp+0x10
|           ; arg int argc @ rdi
|           ; arg char **argv @ rsi
|           ; DATA XREF from entry0 @ 0x4171
|           0x00004390      4883ec18       sub rsp, 0x18
|           0x00004394      8a05c65a0200   mov al, byte [obj.__rustc_debug_gdb_scripts_section] ; [0x29e60:1]=1
|           0x0000439a      4863cf         movsxd rcx, edi             ; argc
|           0x0000439d      488d3dacffff.  lea rdi, [sym.rev::main::hf8bea8ba77115bd1] ; 0x4350 ; "H\x83\xec8H\x8d\x05m\xdd\x02"
|           0x000043a4      4889742410     mov qword [var_10h], rsi    ; argv
|           0x000043a9      4889ce         mov rsi, rcx
|           0x000043ac      488b542410     mov rdx, qword [var_10h]
|           0x000043b1      8844240f       mov byte [var_fh], al
|           0x000043b5      e886feffff     call sym std::rt::lang_start::h328d8a166e8eb4ab ; sym.std::rt::lang_start::h328d8a166e8eb4ab
|           0x000043ba      4883c418       add rsp, 0x18
\           0x000043be      c3             ret

```

What we see is a fairly simple function that loads a pointer to the other main function into `rdi` and passes that as an argument to `std::rt::lang_start`.
This function initializes the rust runtime and calls are true main function.

### functions
From our previous example we already know that rust uses fastcall as its calling convention (It pass arguments to functions through registers instead of on the stack).
Now that we know about the calling convetion lets break down or real main function.

Here is the real main functions disassembly.

```
/ 55: sym.rev::main::hf8bea8ba77115bd1 ();
|           ; var int32_t var_8h @ rsp+0x8
|           ; DATA XREF from main @ 0x439d
|           0x00004350      4883ec38       sub rsp, 0x38               ; .//src:1
|           0x00004354      488d056ddd02.  lea rax, [0x000320c8]
|           0x0000435b      31c9           xor ecx, ecx
|           0x0000435d      4189c8         mov r8d, ecx
|           0x00004360      488d7c2408     lea rdi, [var_8h]
|           0x00004365      4889c6         mov rsi, rax
|           0x00004368      ba01000000     mov edx, 1
|           0x0000436d      b908000000     mov ecx, 8
|           0x00004372      e889000000     call sym core::fmt::Arguments::new_v1::h3203dc4013591ae6 ; .//src:237 ; sym.core::fmt::Arguments::new_v1::h3203dc4013591ae6
|           0x00004377      488d7c2408     lea rdi, [var_8h]
|           0x0000437c      ff154ef90200   call qword [sym.std::io::stdio::_print::h74e13de89e94daa3] ; [0x33cd0:8]=0x7f50 sym.std::io::stdio::_print::h74e13de89e94daa3
|           0x00004382      4883c438       add rsp, 0x38
\           0x00004386      c3             ret
```

Just like in c rust creates a stack frame and cleans it up at the begining and end of the function. 
Also unlike our source code we see two functions calls one to `core::fmt::Arguments` and another to `std::io::_print`. This is because `println!` as many already
know is a macro in rust. Before I address macros I will quickly explain the functions `core::fmt::Arguments` is a precompiled format string and `std::io::_print` is a generic print. 

Also as a note because radare didn't pick it up the data at `0x000320c8` that is loaded into rax is the address of "Hello, world". This can be figured out
by using `s 0x000320c8` in combination with visual mode to view what is at that address.

### Macros
Previously I quickly mentioned macros and without going into explaing metaprogramming I will try and provide some context for the non macro savy.
Put simply macros are ways in which a programer can define code that acts and is called like a function, but when the compiler actually compiles the program it runs through and looks for macros 
and then expands them into the source code and proceeds with compiling. This is very useful if you have a certain bit of code you are writting out a lot, but is two short to deserve being put into a function.
Macros can also be used for things like adding new syntax. 

In short you don't have to learn "new" concepts per say when you are reversing code that utilizes macros, but it is nice to understand what macros are and that they get expanded at compile time because 
of how heavily used macros are in rust.

## Closing
As a quick recap we learned about how rust gets to executing main, the calling convention that rust uses, and why understanding macro expansion is important.

Thanks for reading happy hacking - wolfshirtz

## Tool Links
[radare2](https://rada.re/n/)
[rust/cargo](https://www.rust-lang.org/learn/get-started)

## Useful links
[rust docs](https://doc.rust-lang.org/beta/std/index.html)
[rust book](https://doc.rust-lang.org/book/)
[radare2 cheat sheet](https://github.com/radareorg/radare2/blob/master/doc/intro.md)
