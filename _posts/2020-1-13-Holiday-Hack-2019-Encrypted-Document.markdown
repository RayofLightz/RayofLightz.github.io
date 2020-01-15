---
layout: post
title: "KringleCon 2: Recovering the clear text document"
categories: holidayHack 
---

# KringleCon 2: Recovering the clear text document

## Overview
The elfscrow program used a predictable seed(time) along with a predictable PRNG. Given that time was the seed and that we were supplied with a 
time window, it was determined that there were 7200 possible keys. After bruteforcing the key the flag was found to be "Machine Learning Sleigh Route Finder"


## Challenge text

"The Elfscrow Crypto tool is a vital asset used at Elf University for encrypting SUPER SECRET documents. We can't send you the source, but we do have debug symbols that you can use.

Recover the plaintext content for this encrypted document. We know that it was encrypted on December 6, 2019, between 7pm and 9pm UTC.

What is the middle line on the cover page? (Hint: it's five words)"


## Initial thoughts
The challenge gives us a binary, a pdb file, an encrypted document, and a ruff time estimate of when the document was encrypted.

My first impression was a glimmer of hope that the uuid would be time based, but it was uuid 4 so it was completely random. With that path exhausted fairly quickly I moved on to gathering more information.
I ran the program with no arguments and saw that there was a flag called `--insecure`. The description for that flag was that it would send the traffic over http instead of https. I opened up wireshark and captured some packets while
running the program. 

![firstRun](/assets/wireshark_by_cmd.png)


## Networking in the binary
While reverse engineering the application I first looked for xrefs to `HttpSendRequestA` because while running the program I saw it print out url endpoints.
There were two functions that called `HttpSendRequestA`.
![HttpXrefs](/assets/Http-xrefs.png)
This helped me narrow down what functions were dealing with the actual encryption keys (Note I could have just as easily looked for xrefs to the encryption functions,
but I really wanted to understand how the binary works).

The two functions each had different api endpoints that they called out to. I decided to look at the one calling out to `/api/register` (I will refer to the function as storeKey from here on out). Inside of storeKey a few notable
things can be seen
1. The user agent ""ElfScrow V1.01 (SantaBrowse Compatible)"
2. The server sends back the uuid key after making a POST request with the key. It then prints a message telling the user to hold onto it for decryption later.
3. This is the most important part, the key is passed as a parameter to `storeKey`, which means that whatever function that calls it will have access to the key :)

For the rest of this section I am going to cover the other function, note it does not relate directly to the solution, but I think its fun to get a better understanding of how the binary works.

The second function that deals with networking I am going to call `checkKeyServer`. `checkKeyServer` calls out to the api endpoint `/api/retrieve`. This function is basically the inverse of 
`storeKey`.`checkKeyServer` takes the uuid that `storeKey` gets back from the server and queries the server for the associated encryption key. It then reads that key into a buffer which is later used for decryption.

## Cryptography

### Identifying the algorithm and the MS crept functions
But how does that networking information lead us to the crypto part? The secret lies into the xrefs from `storeKey`. Store key is called by a high level function I am going to call `encrypt`. When first looking at `encrypt`
I noticed the following interesting function calls along with the Microsoft documentation links for them
1. `CryptAcquireContext` - https://docs.microsoft.com/en-us/windows/win32/api/wincrypt/nf-wincrypt-cryptacquirecontexta
2. `CryptImportKey` - https://docs.microsoft.com/en-us/windows/win32/api/wincrypt/nf-wincrypt-cryptimportkey
3. `CryptEncrypt` - https://docs.microsoft.com/en-us/windows/win32/api/wincrypt/nf-wincrypt-cryptencrypt

These are all functions from `advapi.dll` and more specifically they are functions from the old windows cryptography interface. 
For those who ignored the msdn docs here is some pseudo code of how to use the functions
```
context Context
HCRYPTKEY impKey

CryptAcquireContext(&Context)

key = 'HopeFully-A-Properly-Generated-Key'

CryptImportKey(Context, key, impKey)
CryptEncrypt(impKey, stuffToEncrypt)
```

This pseudo code oversimplifies how the functions actually work to make the process of encryption easier to understand. First a context is created, then a key is 'securely generated', next the aforementioned key is
imported into the context and loads a HCRYPTKEY struct and finally we encrypt the data. I RECOMMEND READING THE MICROSOFT DOCS FOR A BETTER UNDERSTANDING OF THESE FUNCTIONS!!!!, however that is the 
simplified version of what is occurring.

With this knowledge we need to find two thing still
1. The encryption algorithm and the mode of operation
2. The keygen

Luckily for us Santa's elves in the software development branch on the north pole left a lot of handy debug messages in the code for example the helpful error message 

`CryptImportKey failed for DES-CBC key`

Now we now the encryption algorithm and the mode in which it operates.
It can also be seen that no initialization vector (IV) is set, which is bad practice. 

Now on to reversing the key gen algorithm.

### Keygen
The next step is figuring out how the keygen algorithm is implemented. From here on out I am going to call the top level keygen function `keyGen`.

Looking at the ghidra decompile three (non standard) functions, which I renamed `genSeed`, `genBytes` and `setSeed`, are called.
The two functions of particular interest are `genSeed` and `genBytes`. 

![KeyGen](/assets/keyGen.png)

Looking at the looking at the rough decompile of `genSeed` it can be seen that the function `_time64` is called. 

![genSeed](/assets/genSeed.png)

According to the Microsoft documentation for `_time64`

"(time64) Returns the time as seconds elapsed since midnight, January 1, 1970"

This means the seed is the number of second since epoch. Keep this in mind because this is the first crucial mistake that the elves made while developing this application. 

Next comes looking into `genBytes`. The most effective way to reverse this function is to look at the disassembly instead of the decompile. 

![genBytes](/assets/genBytes.png)

Here is a translation of the decompile to pseudo code

```
seed = seed * 0x343fd + 0x269ec3
seed = SHIFT_RIGHT_BY_0x10(seed)
seed = AND_BY_0x7FFF(seed)
return seed
```

This is a predictable "random" number generator (Also called an PRNG which is short for pseudo random number generator). Before we implement it, there is one more detail that is needed from the disassembly of `keyGen`.

![keyGenDis](/assets/moreDis.png)

Looking at the disassembly of `keyGen` the line that matters the most is `AND ECX, 0xff` put simply this assembly takes the return of `genBytes` and converts it into a single byte.
That byte is then append to the key. This is the second issue that was made that allows for this challenge to be solved, a predictable RNG algorithm was used. 
With these two bits of information we can move onto decryption the document.

## Exploiting the flaw

Okay after reversing the crypto we now know that the program uses a predictable PRNG and a non random seed, but you may be wondering how this could lead to use being able to decrypt the document.
The answer to that is that if you recall we are given a time frame in which the document was encrypted, specifically the time frame was December 6, 2019, between 7pm and 9pm UTC, these values
can be converted to seconds since the epoch and since we know that it is a two hour time frame that means that there are 7200 possible keys to allow for the document to be decrypted.
Cryptographically speaking that is a very low number of possibilities for the key. Okay so we know the flaw now lets look at the solution code.

{% highlight python %}
from Crypto.Cipher import DES as Des
import time

def genKey(seedTime):
    #Based on the disassembly
    seed = seedTime
    key = []
    for i in range(8):
        seed = seed * 0x343fd + 0x269ec3
        key.append((((seed >> 0x10) & 0x7fff) & 0xff))
    return key

def genPossibleKeys():
    #Iterate over the possible time values
    #Note this will loop over 7202 possible keys because I expanded the window by two
    for i in range(1575658799, 1575666001):
        keyList = genKey(i)
        yield bytes(keyList)

def decryptFunc(key, outfile):
    #This is used to benchmark the amount of time a single decypt takes
    start = time.time()
    #This creates the des-cbc cipher, which has a null iv
    cipher = Des.new(key, Des.MODE_CBC, b'\x00\x00\x00\x00\x00\x00\x00\x00')
    
    #Open our two files for decryption
    f = open("ElfUResearchLabsSuperSledOMaticQuickStartGuideV1.2.pdf.enc", "rb")
    o = open(outfile, "wb+")
    print("Decrypting to {}".format(outfile))
    o.write(cipher.decrypt(f.read()))
    f.close()
    o.close()
    end = time.time()
    print("Time to run dec: " + str(end - start))

if __name__ == "__main__":
    keys = list(genPossibleKeys())
    #Iterate over the possible keys and run try and decrypt them
    for i in range(0,len(keys)):
        fileName = "outdir/attempt{}.dec".format(str(i))
        decryptFunc(keys[i], fileName)
{% endhighlight %}

This is a simple python script I wrote to go through and test every possible key (bruteforce), it then stores the decryption results into 
an output directory `outdir/`. Run this script and then go brew yourself some tea depending on how fast your computer is.

You will be left with a directory of 7202 files which seems useless at first, but with the help of a simple bash oneliner we can find the intended output.

`file output/* | grep 'PDF'`

That oneliner will return a single pdf. After opening the pdf file in a viewer I confirmed that it was the correct result.

![WootWoot](/assets/WootWoot.png)

The flag was "Machine Learning Sleigh Route Finder"

## How to prevent something like this
The easiest way to prevent an attack like this would be to use a "secure" PRNG with a non predictable seed. 
For win32 use a function like `BCryptGenRandom`, if you are on a different platform make sure to research a safe PRNG. 
The overkill answer is to use a hardware based RNG, but these can become expensive and most consumers don't have one.

## Final notes

### Summary
Elfscrow used contained a poorly implemented keygen algorithm that allowed for a possible bruteforce. To avoid this remember that it is not safe to role you own keygen and that time should

### My experience
This was a fun challenge. I love reverse engineering things and this challenge gave me the change to play around with the win32 crypto stack. SANS did an excellent job with this challenge!
