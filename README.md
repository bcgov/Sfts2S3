![img](https://img.shields.io/badge/Lifecycle-Stable-97ca00)
# sfts2s3
Utility to move all files in a folder from BC Secure File Transfer Service to s3, once or cron. 

## Features
 
* Move files from sfts to s3
* can be invoked once or scheduled to run repeatedly
* support deployment to OpenShift
 
## Usage
### Configuration
*sfts2s3* takes following input parameters in the form of either command line option or environment variable, with command line option taking precedence

| Command Line Opt           | Environment Variable  | Mandatory | Description                                                                                                    |
|----------------------------|-----------------------|-----------|----------------------------------------------------------------------------------------------------------------|
| -s, --sfts-host|SFTS_HOST|No|SFTS host. Default to *filetransfer.gov.bc.ca*
|-u, --sfts-user|SFTS_USER|Yes|SFTS login user name. Need to have read/write permission to the SFTS folder.
|-p, --sfts-password|SFTS_PASSWORD|Yes|SFTS login password
|-f, --sfts-folder|SFTS_FOLDER|No|SFTS folder. Default to */*
| -b, --s3-bucket             | S3_BUCKET             | Yes       | s3 bucket                                                                                                      |
| -r, --s3-path-prefix        | S3_PATH_PREFIX        | Yes       | s3 path prefix                                                                                                 |
| -a, --aws-access-key-id     | AWS_ACCESS_KEY_ID     | Yes       | aws access key id. The associated user needs to have write access to the S3 bucket path.|
| -k, --aws-secret-access-key | AWS_SECRET_ACCESS_KEY | Yes       | aws secret access key|
| -c, --cron-time-spec        | CRON_TIME_SPEC        | No        | [node cron patterns](https://github.com/kelektiv/node-cron#available-cron-patterns). *0 0 \* \* \* \** as hourly on the hour, for example. If not set then run once. If set, a round of operation is performed immediately upon launching regardless of time spec. |
| -z, --cron-time-zone        | CRON_TIME_ZONE        | No        | time zone such as *America/Vancouver*. All time zones are available at [Moment Timezone](http://momentjs.com/timezone/).  |
| -C, --concurrency        | CONCURRENCY        | No        | How many files are processed concurrently when uploading to S3? Default to 10 if not set. |

##### Install and Launch
Choose one of the following verified methods

###### From Source
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

###### Docker
Need docker cli

```
docker build -t sfts2s3 https://github.com/bcgov/sfts2s3.git
docker run sfts2s3 npm start -- <opts>
```

###### Openshift
Need oc cli and logged into openshift target deployment project

```
oc new-app https://github.com/bcgov/sfts2s3.git <-e ENV=VALUE> ...
```
An Openshift app is expected to be long running so env *CRON_TIME_SPEC* documented below is mandatory. If a specific time is set in *CRON_TIME_SPEC* rather than wildcard, it is also advised to set *CRON_TIME_ZONE* because time zone defaults to UTC by the builder image.

To uninstall, assuming the app name is the default *sfts2s3* and there is no other app with duplicated name

```
oc delete all -l app=sfts2s3 --grace-period=0 --force --cascade
```

## Limitations

  * only moving files in leaf folder has been tested

## Project Status
 
This project is in production and the GDX Analytics Team will continue to update and maintain the project as required.
 
## Related Repositories
 
### [GDX-Analytics/](https://github.com/bcgov/GDX-Analytics)
 
This is the central repository for work by the GDX Analytics Team. It contains [Secure File Transfer System microservice](https://github.com/bcgov/GDX-Analytics/tree/master/microservices/sfts) that moves files from s3 to sfts.
 
## Getting Help or Reporting an Issue
 
For any questions regarding this project, or for inquiries about starting a new analytics account, please contact the GDX Analytics Team.

## Contributors

The GDX Analytics Team are the main contributors to this project and maintain the code.

## How to Contribute

If you would like to contribute, please see our [CONTRIBUTING](CONTRIBUTING.md) guideleines.

Please note that this project is released with a [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## License

```
Copyright 2015 Province of British Columbia
 
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
 
   http://www.apache.org/licenses/LICENSE-2.0
 
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and limitations under the License.
```
