#/bin/bash

set -o errexit

creds=$(aws sts get-session-token \
  --serial-number $AWS_SERIAL \
  --token-code $1)

key=$(echo $creds | jq .Credentials.AccessKeyId)
secret=$(echo $creds | jq .Credentials.SecretAccessKey)
token=$(echo $creds | jq .Credentials.SessionToken)

echo "export AWS_ACCESS_KEY_ID=$key"
echo "export AWS_SECRET_ACCESS_KEY=$secret"
echo "export AWS_SESSION_TOKEN=$token"
