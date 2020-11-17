#!/bin/bash
#
# Usage: s3-touch.sh s3://my-bucket/my/path [include-glob] [s3-options]
#

set -o errexit

prefix=${1?is required}
includes=${2:-'*'}

aws s3 cp \
  --metadata 'touched=true' \
  --recursive --exclude="*" \
  --include="$includes" \
  --acl bucket-owner-full-control \
  "${@:3}" \
  "$prefix" "$prefix"
