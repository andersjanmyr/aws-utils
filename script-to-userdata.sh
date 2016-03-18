#!/bin/bash
echo '{ "Fn::Join": ["", ['
sed 's/"/\\"/g;s/\(^.*$\)/"\1\\n",/;$ s/.$//g' $*
echo ']]}'

