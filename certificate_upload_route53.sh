#!/usr/bin/env bash

set -o errexit

if [ $# -lt 1 ]
then
  echo "Invalid number of arguments: $#"
  echo "Usage: $program <certname> [root_cert]"
  exit 1
fi

suffix=`date +%Y%m`
cert=${1}
root_cert=${2:-DigiCertCA.crt}
cert_name="${cert}_$suffix"
cloudfront_cert_name="${cert_name}_cloudfront"
aws_profile=''

if [ -n "${profile}" ]; then
  aws_profile="--profile ${profile}"
fi

if [ ! -f bundle.crt ]; then
  echo 'Cannot find bundle.crt, will generate it with:'
  echo "cat ${cert}.crt ${root_cert} >> bundle.crt"
  cat ${cert}.crt ${root_cert} >> bundle.crt
fi

if [ ! -f ${cert}.rsa ]; then
  echo "Cannot find ${cert}.rsa, will generate it with:"
  echo "openssl rsa -in ${cert}.key -out ${cert}.rsa"
  openssl rsa -in ${cert}.key -out ${cert}.rsa
fi

cert_md5=`(openssl x509 -noout -modulus -in bundle.crt || echo cert_err) | openssl md5`
rsa_md5=`(openssl rsa -noout -modulus -in *.rsa || echo rsa_err) | openssl md5`

if [[ "$cert_md5" != "$rsa_md5" ]]; then
  echo 'The rsa key does not match the certificate'
  echo $cert_md5 "(csr)"
  echo $rsa_md5 "(rsa)"
  exit 3
fi

echo "Start uploading of certs..."
cmd1="aws iam upload-server-certificate ${aws_profile}\
  --server-certificate-name ${cert_name} \
  --certificate-body file://bundle.crt \
  --private-key file://${cert}.rsa"

echo $cmd1
$cmd1

cmd2="aws iam upload-server-certificate ${aws_profile}\
  --server-certificate-name ${cloudfront_cert_name} \
  --certificate-body file://bundle.crt \
  --private-key file://${cert}.rsa \
  --path /cloudfront/${cert}/"

echo $cmd2
$cmd2

echo "Clean up..."
rm -f bundle.crt ${cert}.rsa
