---
layout: post
title: "Basic shellcoding for linux on x86"
categories: Shellcoding linux x86
---
### Beginning
Writing shellcode is an excellent way to learn more about assembly language and how a program communicates with
the underlying OS. Put simply shellcode is code that is injected into a running program to make it do something
it was not made to do. Normally this is to spawn a shell, but any code made to run after a bug in a program is
exploited counts as shellcode.

Before you begin writing shellcode it is a good idea to read a few tutorials on writing assembly programs.
A good reference would be [tutorial points][Tutpoints]. To compile the assembly code for this tutorial I used nasm. To make the process of compiling the shellcode and extracting the op codes easier I have included a makefile to
aid in the process.

### Hello world
Lets begin with a shellcode that prints out to the screen hello world.
Here is the end shellcode. Save it in a file named `shellcode.asm`.
{% highlight assembly %}
section .text
    global _start

_start:
    xor eax, eax
    push eax
    push 0x0A646c72 ; hello world
    push 0x6f77206f
    push 0x6c6c6548
    mov bl, 0x1 ; stdout
    mov ecx, esp ; the address of hello world
    mov dl, 0xe ; the length of hello world
    mov al, 0x4  ; sys_write syscall
    int 0x80 ; call the syscall
    mov al, 0x1 ; sys_exit syscall
    int 0x80 ; call the syscall

{% endhighlight %}
The make file is as follows
{% highlight make %}
all: shellcode

shellcode.o: shellcode.asm
	nasm -f elf shellcode.asm

shellcode: shellcode.o
	ld -m elf_i386 -o shellcode shellcode.o

.PHONY: clean
clean:
	rm shellcode.o
	rm shellcode
.PHONY: raw
raw:
	printf '\\x'
	printf '\\x' && objdump -d shellcode | grep "^ " | cut -f2 | tr -d ' ' | tr -d '\n' | sed 's/.\{2\}/&\\x /g'| head -c-3 | tr -d ' ' && echo ' '
{% endhighlight %}
To compile this shellcode run `make all` then run `./shellcode`. You should see Hello world outputted to the screen.
This is a shellcode that writes hello world. We start out by XORing eax to zero out the register. We then push eax onto the stack as a null byte. Then we push hello
world onto the stack. Hello world is pushed onto the stack in reverse because x86 is little endian. Next comes the part that makes the shellcode a little more involved.
When we move hex 0x1 into what would normally be the ebx we instead use bl. We are using the 8 bit register portion of ebx so we do not have null bytes in our shellcode.
Why wouldn't we want null bytes in our shellcode? The reason, put simply, is functions like `strncpy()` will stop copping a string when they reach a nullbyte. This would result in our shellcode being cut off and not being executed
correctly. We then copy the address of hello world into ecx and the length of our shellcode into dl. After this we move 0x4 into al. This sets the syscall we are using to the write syscall. We then use int 0x80 which tells the
kernel to call our syscall. After this we set al to 0x1(The exit syscall) which we then use int 0x80 again to tell the kernel we want this process to be "exited". If you are confused don't worry I will explain in the upcoming
section.

### Syscalls, op-codes, and registers. Oh my (featuring the stack)
## Syscalls
In the explanation of the hello world shellcode above you may have been wondering what a syscall is. A syscall is a way for a process to communicate with the underlying operating system. This makes it easier for programmers to say
write to a file or change the permissions of a file. Instead of having to spend time implementing their own solution programmers were able to relay on the operating system to handle certain tasks. Syscalls are called in x86 assembly by setting the eax register to the syscall number. The syscall number is just a number that is associated with a certain syscall. For example the syscall `sys_exit` has the hex value of 0x1.
Syscalls are used in shellcode because the process dose not have to find and load in a shared object or have statically linked code to obtain functionality outside of the program. Syscalls are always there for our shellcode to call. In the hello world shellcode
I use two syscalls of interest `sys_write` and `sys_exit`. `sys_write` writes a string to a file descriptor(in our case 1 for stdout) and `sys_exit` simply "exits" the program like `exit();` in c.
A great reference for syscalls on linux and their corresponding numbers can be found [here][sys_call_ref].
## Opcodes
Lets talk about op-codes. Op-codes are the hexadecimal representation of the instructions that we write in assembly. You can extract the opcode for our shell code using the `make raw` command. This is just a recipe inside of the make file I added to make the process easier to understand.
The op-codes that are extracted are the final payload that gets sent to a target that is being exploited. In shellcode you will notice that (for the most part) you will never see 0x00 in them. 0x00 is a null byte and null bytes in shellcode can lead to unreliable shellcode because
shellcode with null bytes might have opcodes cut off by functions like `strcpy()`. If our shellcode has null bytes and is cut off before the ending it could lose crucial functionality. This brings us to our next section.

## Registers
Now to talk about registers. Registers are essentially tiny variables that exist on the cpu. They can be used to store data or addresses that point to data.
On x86 there are 7 general purpose registers. Of that 7 only 4 are normally used by the programmer(ESP, EBP and ESI have their own special uses). The other 4 are EAX, EBX, ECX, and EDX. Each one can store 32 bits(or 4 bytes) of data. Each of those registers has three smaller registers that can be used to access the lower bits
of the registers. For example the EAX register has AX, AH, and AL. AX is used to access the lower 16 bits of EAX. AL is used to access the lower 8 bits of EAX and AH is used to access the higher 8 bits.
So why is this important for writing shellcode? Remember back to why null bytes are a bad thing. Using the smaller portions of a register allow us to use `mov al, 0x1` and not produce a null byte.
If we would have done `mov eax, 0x1` it would have produced null bytes in our shellcode. EBP, ESP and EIP are each used for a special purpose. EBP is used to point to the base of the stack(explained below), ESP is used to point to the top of the stack(also explained below) and EIP is the instruction pointer. The instruction pointer just points to the address of the next instruction to be executed.


## The stack
The stack is a portion of memory that programmers can use to store large amounts of data. When a programmer wants to put data onto the stack they use the `push <data>` instruction. If they want to retrieve data from the stack they would use the `pop <dest>` instruction. The stack is a first in last out(FILO) data structure. A simple way of visualizing this is to think of a pile of books.
The books on bottom of the pile where placed there first. To get to the book on the bottom of the pile of books you would have to take off the books on top of it.  The base of the stack(most recent thing that is pushed on to the stack) is pointed to by the address ebp and the top of the stack is pointed to by ESP. In our hello world shellcode we can see the instruction `mov ecx,esp`. Here we are copying the address of the top of the stack into ECX. If you look at the push instructions we push the newline character then d on to the stack first.
This is because of the Endienness of x86 and the orientation of the stack. You still maybe wondering why it is that the stack is used in shellcode to store data. The reason is that shellcode do not have access to the data section that normal assembly programs would have. To be able to have our own data we use the `push` instruction along with the hexadecimal representation of our characters to store data that would need to be used by our shellcode.

### Putting it all together
Okay so now that we have a hold on how to write shellcode. Lets write a shell code that calls `sys_execve` to run `/bin/sh`. So here is the assembly code.
{% highlight assembly %}
section .text
    global _start

_start:
    xor eax, eax; safe null
    push eax; push null byte onto stack
    push 0x68732f2f ; push /bin//sh
    push 0x6e69622f
    mov ebx,esp ; set ebx to out cmd
    mov ecx, eax; no args
    mov edx, eax ; no args again
    mov al, 0xb ; set sys_execve
    int 0x80
{% endhighlight %}
Save this code into `shellcode.asm` and then use `make all` to compile it. To test the shellcode you can run `./shellcode` like before. You might wonder why we are using `/bin//sh` instead of `/bin/sh`. We use `/bin//sh` because we want our push - es to have a number divisible by 4 so we can push our data on the stack with out null bytes.
We then use ebx to point to our shellcode. After that we set the args to null and the number of args to null because we are calling /bin//sh without any arguments. Then after that we set al to hex 11 and finish off with an `int 0x80` to run our shellcode.

### Useful links
I am a firm believer that the more sources of knowledge that one person has at their fingers makes it easier to learn. So here is a list of excellent tutorials other than mine to continue or reaffirm your shellcoding journey.
1. [0x00sec][tut1] a different x86 linux shellcoding tutorial.
2. [Exploit db][tut2] Exploitdb's tutorial on linux shellcoding. Nice visuals and talks more about the commands I use in `make raw`.


All the shellcode will be up on my [github][githb]. Thanks for reading and as always happy hacking.

[Tutpoints]: https://www.tutorialspoint.com/assembly_programming/
[sys_call_ref]: https://syscalls.kernelgrok.com/
[tut1]: https://0x00sec.org/t/linux-shellcoding-part-1-0/289
[tut2]: https://www.exploit-db.com/docs/english/21013-shellcoding-in-linux.pdf
[githb]: https://github.com/Rayoflightz
