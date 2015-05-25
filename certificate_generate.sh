#!/bin/bash

set -o errexit
set -o nounset

program=$0

if [ $# -lt 1 ]
then
  echo "Usage: $program domain"
  exit 1
fi

domain=$1

underscore_escaped=${domain//\./_}
domain_escaped=${underscore_escaped//\*/star}

subject="/C=SE/ST=Skane/L=Hjarup/O=Janmyr/OU=Janmyr/CN=$domain"

echo "Generating CSR for $domain"
echo "$subject"

openssl req -new -nodes \
  -newkey rsa:2048 \
  -out "${domain_escaped}.csr" \
  -keyout "${domain_escaped}.key" \
  -subj "$subject"

echo ""
echo "Please send the ${domain_escaped}.csr to iccs-certificates@sonymobile.com to get a certificate."
