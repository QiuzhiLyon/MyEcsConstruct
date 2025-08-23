# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

## Bootstrap
cdk bootstrap aws://095254076971/us-east-1

cdk destroy

aws elbv2 describe-load-balancers

http://myecsc-myfar-kooyzjewb1im-741086476.us-east-1.elb.amazonaws.com/


npm install @aws-cdk/aws-ecs @aws-cdk/aws-ec2 @aws-cdk/aws-rds @aws-cdk/aws-secretsmanager @aws-cdk/aws-lambda @aws-cdk/aws-iam @aws-cdk/aws-logs

## Github Token
https://github.com/settings/tokens/
https://github.com/settings/tokens/2320163786

### Deployment:
First deploy (bootstrap):

cdk deploy -c usePipelineImage=false

After pipeline succeeds:

cdk deploy -c usePipelineImage=true

## Workflow
GitHub (commit)
│
▼
CodePipeline ──► Source Stage
│
▼
CodePipeline ──► Build Stage (CodeBuild)
│       - docker build from source
│       - tag & push to ECR
│       - generate imagedefinitions.json
▼
CodePipeline ──► Deploy Stage (EcsDeployAction)
│       - read imagedefinitions.json
│       - update ECS task definition
▼
ECS Service ──► Running Tasks pull new image from ECR