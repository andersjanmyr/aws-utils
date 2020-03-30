#!/bin/bash

set -o errexit

prefix=$1
includes=$2

aws s3 cp \
  --metadata 'touched=true' \
  --recursive --exclude="*" \
  --include="$includes" \
  --acl bucket-owner-full-control \
  "${@:3}" \
  "$prefix" "$prefix"
