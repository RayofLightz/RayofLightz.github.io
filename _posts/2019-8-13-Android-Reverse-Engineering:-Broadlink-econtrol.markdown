---
layout: post
title: "Android Reverse Engineering: Broadlink econtrol"
categories: re andriod
---

### An introduction
The broadlink e-control was built to control broadlinks line of IR/RF emitters.
These devices are fairly inexpensive and given what they were built for, the homeautomation community has already
created support for the broadlink IR/RF switches. The purpose of this post is not to find or create something new, but to
demonstrate the process of how to tinker with IOT devices and their companion android applications. My goal for this post is to find the *coughs*
spoiler *coughs* 128 bit aes key and iv. 

## Why Android
To make it clear I am 100 percent sold to the IOS platform, but android applications have a few benefits when it comes to make RE a lot easier.
The first being that most android applications are written in java and decompilers can be used to obtain a close to source representation.
The second is that it is a lot easier to obtain apks (the android application package format) than it is ipas (the ios application package format).

## First step: Recon/extraction
After obtaining the apk from [Apkpure][ApkPure], the first step is to extract the contents of the apk. This is fairly simple because 
apks are zip files with other fancy jargon inside (More on said jargon later). To extract the contents of the apk this command will suffice.
`unzip econtrol.apk`

Here is the resulting file structure
```
.
├── AndroidManifest.xml
├── assets
├── build-data.properties
├── classes.dex
├── com
├── e Control_v3.8.16_apkpure.com.apk
├── jsr305_annotations
├── lib
├── META-INF
├── org
├── res
└── resources.arsc
```
Now a quick explination of the aformentioned jargon. The `AndroidManifest.xml` is an Andriod binary xml file that contains information about the apk.
Most importantly it contians the permissions of the application; which is useful if you are reverse engineering malware.
The `META-INF` directory contains more metadata. The `res` directory has non code resources and lib has thirdparty or system libraries (non java).
The `classes.dex` file is the compiled java byte code that will run on the dalvik vm (Androids JVM implementation).
In the case of the broadlink e-control application, what we care most about is the `classes.dex` and the `lib` directory.

Next we can use jadx to decompile the apk into a new directory; `out` in this command example.
`jadx -d out classes.dex`
Next we can start poking around the decompiled code.
While browsing the source code a few files and directories stood out. Notably:
```
file: out/sources/cn/com/broadlink/networkapi/NetworkAPI.java
dir: out/sources/cn/com/broadlink/blnetworkdataparse
dir: out/sources/cn/com/broadlink/blnetworkunit
```
And now onto reverse engineering the code.

## Reverseing and key discovery
The first off is the NetworkAPI java file. This file wraps a system library; which means that we get to reverse some arm assembly.
Under the lib directory there is a file called libNetworkAPI.so which is an android shared object.
Next, we can open up the NetworkAPI shared object into ghidra. 
After opening the shared object with ghidra I started by searching for xrefs on the socket function. I found a function called `bl_device_send_data`.
This function is the lower level version of another function called `networkapi_device_send_data`. Luckily for us the broadlink developers left
several debug messages that help in identifying functions that ghidra did not detect. While reverse engineering the network stack I discovered two things.

1. The application uses udp for communication.(Interesting if you wanted to reimplement the entire api)
2. Data is encrypted with 128 bit aes.

It should be noted that there are other interesting things in this binary, but for the sake of keeping this short I will focus on getting the key and IV.
While performing static analysis on the shared object I was able to find the IV in the decompilation of the function `data_aes_decrypt`. 
![The decryption function being called with log messages being shown](/assets/decryptFunc.png)

I then copied the hex bytes of the key.
Next thing I do is look at the data entry under the one for the IV. Looking at it is 16 bytes (128 bit) just like the IV. Looking at the XREFs for the data it is accessed by a function that is in turn called by `bl_device_send_data`.
So according to my findings the key should be `097628343fe99e23765c1513accf8b02` in hex and the IV is `562e17996d093d28ddb3ba695a2e6f58`. 
![The keys in ghidra listing view](/assets/ghidraKeys.png)

## Confirmation
The broadlink device has already been reverse engineered and the entire api has been reimplemented in python.
This is very helpful because instead of writing a script to test my findings I can read the already existing documentation. 
The documnetation can be accessed [here][Pyimpl]. Sure enough the key and iv I found were correct.

## Conclusion
While I did not make any ground breaking research, I was able to go through the process of reverse engineering a production android application.
I was able to gain more hands on experience with ghidra and the ARM platform. Most importantly it was a fun challenge and a nice change
from mostly reversing CTF challenges. 

## Other good resources
* [Evilsocket's android reversing 101][Evil]
* [Maddie Stone's android RE 101][Maddie]
* [Android Docs][AndD]

[Pyimpl]: https://github.com/mjg59/python-broadlink/blob/master/protocol.md
[ApkPure]: https://apkpure.com/e-control/com.broadlink.rmt
[Evil]: https://www.evilsocket.net/2017/04/27/Android-Applications-Reversing-101/
[Maddie]: https://maddiestone.github.io/AndroidAppRE/app_fundamentals.html
[AndD]: https://developer.android.com/docs
