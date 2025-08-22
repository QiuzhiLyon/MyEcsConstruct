import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as custom from 'aws-cdk-lib/custom-resources';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

import * as ecr from "aws-cdk-lib/aws-ecr-assets";
import * as path from 'path';

export class MyEcsConstructStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "MyVpc", {
      maxAzs: 3 // Default is all AZs in region
    });

    const cluster = new ecs.Cluster(this, "MyCluster", {
      vpc: vpc
    });

    const initTaskSG = new ec2.SecurityGroup(this, 'InitTaskSG', {
      vpc,
      description: 'Security group for init ECS task',
      allowAllOutbound: true // default is true
    });

    const db = new rds.DatabaseInstance(this, 'OnlineShoppingDB', {
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_42 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      credentials: rds.Credentials.fromPassword('rootroot', cdk.SecretValue.unsafePlainText('rootroot')),
      allocatedStorage: 20,
      databaseName: 'online_shopping',
      publiclyAccessible: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    db.connections.allowFromAnyIpv4(ec2.Port.tcp(3306), 'Allow public MySQL access');

    const initTaskDef = new ecs.FargateTaskDefinition(this, 'InitTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    initTaskDef.addContainer('InitContainer', {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../init_task'),
          {
            platform: ecr.Platform.LINUX_AMD64,
          }
      ),
      logging: new ecs.AwsLogDriver({ streamPrefix: 'InitTask' }),
      environment: {
        DB_HOST: db.dbInstanceEndpointAddress,
        DB_USER: 'rootroot',
        DB_PASSWORD: 'rootroot',
      }
    });

    const runTask = new tasks.EcsRunTask(this, 'Run Init SQL Task', {
      integrationPattern: stepfunctions.IntegrationPattern.RUN_JOB,
      cluster,
      taskDefinition: initTaskDef,
      launchTarget: new tasks.EcsFargateLaunchTarget(),
      assignPublicIp: true, // or false depending on your networking setup
      securityGroups: [initTaskSG],
      subnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const stateMachine = new stepfunctions.StateMachine(this, 'InitDbStateMachine', {
      definitionBody: stepfunctions.DefinitionBody.fromChainable(runTask),
      timeout: cdk.Duration.minutes(5),
    });

    // Custom resource to start the State Machine execution
    const startExecution = new custom.AwsCustomResource(this, 'StartInitTaskExecution', {
      onCreate: {
        service: 'StepFunctions',
        action: 'startExecution',
        parameters: {
          stateMachineArn: stateMachine.stateMachineArn,
        },
        physicalResourceId: custom.PhysicalResourceId.of('InitTaskExecution'),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [stateMachine.stateMachineArn],
      }),
    });

    // Create a load-balanced Fargate service and make it public
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, "MyFargateService", {
      cluster: cluster, // Required
      cpu: 256, // Default is 256
      desiredCount: 3, // Default is 1
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(
            '/Users/Peng/Workspace/OnlineShopping_07',
            {
              platform: ecr.Platform.LINUX_AMD64
            }
        ),
        containerPort: 8070,
        environment: {
          DB_HOST: db.dbInstanceEndpointAddress
        },
      },
      memoryLimitMiB: 512, // Default is 512
      publicLoadBalancer: true // Default is true
    });

    // After defining the fargateService
    const scalableTarget = fargateService.service.autoScaleTaskCount({
      minCapacity: 3,
      maxCapacity: 6,
    });

// Scale based on average CPU utilization
    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 60, // Target CPU usage
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // Step 4: Ensure app runs RDS → Init SQL task → App FargateService.
    startExecution.node.addDependency(db);
    fargateService.node.addDependency(startExecution);

    // 5. Output the RDS endpoint and LB URL
    new cdk.CfnOutput(this, 'RDSEndpoint', {
      value: db.dbInstanceEndpointAddress,
    });

    new cdk.CfnOutput(this, 'LoadBalancerURL', {
      value: fargateService.loadBalancer.loadBalancerDnsName,
    });
  }
}