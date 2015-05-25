#!/bin/bash

aws iam get-user | jq .User.Arn | cut -d : -f 5

