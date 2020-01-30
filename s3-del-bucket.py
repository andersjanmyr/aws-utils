#!/usr/bin/env python3

import boto3
import sys


s3 = boto3.resource('s3')
for b in sys.argv[1:]:
    print(b)
    bucket = s3.Bucket(b)
    bucket.object_versions.delete()
    bucket.delete()
