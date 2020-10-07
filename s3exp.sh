#!/bin/bash

set -o errexit
set -o noglob

aws_ls() {
  local prefix=$1
  aws s3 ls $prefix/ | awk -v prefix=$prefix 'NF==2 {print prefix "/" $2}' | sed 's/.$//'
}

expand_prefix() {
  aws_ls $1
}

expand_paths() {
  set -- "${@}"
  local prefix=$1
  shift
  while (( "$#" )); do
    local p=$1
    shift
    if [[ "$p" == "*" ]]; then
      local paths=$(expand_prefix $prefix)
      for pp in $paths; do
        expand_paths $pp "$@"
      done
      return
    fi
    prefix=${prefix}/${p}
  done
  echo $prefix
}

expand() {
  local args=($(echo $1 | awk -F/ '{for(i=3; i<=NF; i++) {print $i}}'))
  local prefix="s3://${args[0]}"
  ps=("${args[@]:1}")
  expand_paths $prefix "${ps[@]}"
}

expand $1
