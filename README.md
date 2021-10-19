# sfts2s3
Utility to move all files in a folder from BC Secure File Transfer Service to s3, once or cron. 

## Install
Choose one of the following verified methods

### From Source
Need latest 
  * git
  * nodejs
  * jre

```
git clone https://github.com/bcgov/sfts2s3.git
cd sfts2s3
npm i
node . <opts>
```

Pass options as key=value with an equals sign, as in:
```
node . --run-on-init=false
```

### Docker
Need docker cli

```
docker build -t sfts2s3 https://github.com/bcgov/sfts2s3.git
docker run sfts2s3 npm start -- <opts>
```

### Openshift
Need oc cli and logged into openshift target deployment project

```
oc new-app https://github.com/bcgov/sfts2s3.git <-e ENV=VALUE> ...
```
An Openshift app is expected to be long running so env *CRON_TIME_SPEC* documented below is mandatory. If a specific time is set in *CRON_TIME_SPEC* rather than wildcard, it is also advised to set *CRON_TIME_ZONE* because time zone defaults to UTC by the builder image.

To uninstall, assuming the app name is the default *sfts2s3* and there is no other app with duplicated name

```
oc delete all -l app=sfts2s3 --grace-period=0 --force --cascade
```

## Usage
*sfts2s3* takes following input parameters in the form of either command line option or environment variable, with command line option taking precedence

| Command Line Option | Argument or Environment Variable | Mandatory | Description |
|-|-|-|-|
| --run-on-init | RUN_ON_INIT | No | If set, a round of operation is performed immediately upon initializing. Defaults to false. |
| -n, --no-clobber-copy | | No | If set, transfer process leaves files in SFTS and copies to S3 in a no-clobber mode. Defaults to false. |
| -s, --sfts-host|SFTS_HOST|No|SFTS host. Defaults to *filetransfer.gov.bc.ca*
|-u, --sfts-user|SFTS_USER|Yes|SFTS login user name. Need to have read/write permission to the SFTS folder.
|-p, --sfts-password|SFTS_PASSWORD|Yes|SFTS login password
|-f, --sfts-folder|SFTS_FOLDER|No|SFTS folder. Defaults to */*
| -b, --s3-bucket             | S3_BUCKET             | Yes       | s3 bucket                                                                                                      |
| -r, --s3-path-prefix        | S3_PATH_PREFIX        | Yes       | s3 path prefix                                                                                                 |
| -a, --aws-access-key-id     | AWS_ACCESS_KEY_ID     | Yes       | aws access key id. The associated user needs to have write access to the S3 bucket path.|
| -k, --aws-secret-access-key | AWS_SECRET_ACCESS_KEY | Yes       | aws secret access key|
| -c, --cron-time-spec        | CRON_TIME_SPEC        | No        | [node cron patterns](https://github.com/kelektiv/node-cron#available-cron-patterns). *0 0 \* \* \* \** as hourly on the hour, for example. |
| -z, --cron-time-zone        | CRON_TIME_ZONE        | No        | time zone such as *America/Vancouver*. All time zones are available at [Moment Timezone](http://momentjs.com/timezone/).  |
| -C, --concurrency        | CONCURRENCY        | No        | How many files are processed concurrently when uploading to S3? Defaults to 10 if not set. |

## Limitations

  * only moving files in leaf folder has been tested

## License

Copyright 2019-present Province of British Columbia

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at 

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
