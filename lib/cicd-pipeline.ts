import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {Repository} from 'aws-cdk-lib/aws-ecr';
import {BuildSpec, LinuxBuildImage, PipelineProject} from 'aws-cdk-lib/aws-codebuild';
import {Artifact, Pipeline} from "aws-cdk-lib/aws-codepipeline";
import {CodeBuildAction, EcsDeployAction, GitHubSourceAction} from "aws-cdk-lib/aws-codepipeline-actions";
import {IBaseService} from "aws-cdk-lib/aws-ecs";
import {ApplicationLoadBalancedFargateService} from "aws-cdk-lib/aws-ecs-patterns";

export interface CicdStackProps extends cdk.StackProps {
  ecrRepo: Repository;
  fargateService: ApplicationLoadBalancedFargateService;
}

export class CICDPipeline extends cdk.Stack {
  public readonly pipeline: Pipeline;
  public readonly buildOutput: Artifact;

  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);
    // Build project
    const buildProject = new PipelineProject(this, 'MyAppBuildProject', {
      environment: {
        buildImage: LinuxBuildImage.AMAZON_LINUX_2_5,
        privileged: true
      },
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              `aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin ${props.ecrRepo.repositoryUri.split('/')[0]}`,
              'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
              'IMAGE_TAG=${COMMIT_HASH}'
            ]
          },
          build: {
            commands: [
              'echo Building the Docker image...',
              `docker build -t ${props.ecrRepo.repositoryUri}:$IMAGE_TAG .`,
              `docker tag ${props.ecrRepo.repositoryUri}:$IMAGE_TAG ${props.ecrRepo.repositoryUri}:latest`,
              `docker push ${props.ecrRepo.repositoryUri}:$IMAGE_TAG`,
              `docker push ${props.ecrRepo.repositoryUri}:latest`
            ]
          },
          post_build: {
            commands: [
              'echo Writing imagedefinitions.json file...',
              `printf '[{"name":"onlineshopping","imageUri":"%s"}]' ${props.ecrRepo.repositoryUri}:latest > imagedefinitions.json`
            ]
          }
        },
        artifacts: {
          files: ['imagedefinitions.json']
        }
      })
    });

    props.ecrRepo.grantPullPush(buildProject.role!);

// Create CodePipeline
    this.buildOutput = new Artifact();
    const sourceOutput = new Artifact();

    this.pipeline = new Pipeline(this, 'MyEcsPipeline', {
      pipelineName: 'MyEcsAppPipeline',
      restartExecutionOnUpdate: true
    });

    this.pipeline.addStage({
      stageName: 'Source',
      actions: [
        new GitHubSourceAction({
          actionName: 'GitHub_Source',
          owner: 'QiuzhiLyon',
          repo: 'OnlineShopping_07',
          oauthToken: cdk.SecretValue.secretsManager('github-token'),
          output: sourceOutput,
          branch: 'main'
        })
      ]
    });

    this.pipeline.addStage({
      stageName: 'Build',
      actions: [
        new CodeBuildAction({
          actionName: 'Docker_Build',
          project: buildProject,
          input: sourceOutput,
          outputs: [this.buildOutput]
        })
      ]
    });

    this.pipeline.addStage({
      stageName: 'Deploy',
      actions: [
        new EcsDeployAction({
          actionName: 'Deploy_to_ECS',
          service: props.fargateService.service,
          input: this.buildOutput
        })
      ]
    });

  }
}