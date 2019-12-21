#!/bin/bash

function message {
        #Just a pretty print
        echo -e "[\u001b[32m+\u001b[0m] $1"
}

message "Running spell check"
for f in _drafts/*\.md; do
        aspell -c $f;
done

message "Building the site"
bundle exece jekyll build --drafts

