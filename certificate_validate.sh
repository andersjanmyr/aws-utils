#!/bin/bash

if [ $# -lt 2 ]
then
  echo "Usage: $program cert key"
  exit 1
fi

cert=$1
key=$2

cert_digest=$(openssl x509 -noout -modulus -in "$cert" | openssl md5)
key_digest=$(openssl rsa -noout -modulus -in "$key" | openssl md5)

if  [[ "$cert_digest" != "$key_digest" ]]; then
  echo "Failed to verify manifest $cert with $key"
  echo $cert_digest ' (cert)'
  echo ${key_digest:-empty} ' (key)'
  exit 2
fi
echo OK

