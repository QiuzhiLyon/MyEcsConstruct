#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EcsStack } from '../lib/ecs-stack';
import {CICDPipeline} from "../lib/cicd-pipeline";
import {EcrStack} from "../lib/ecr-stack";

const app = new cdk.App();

const ecrStack = new EcrStack(app, 'EcrStack');

const ecsStack = new EcsStack(app, 'EcsStack', {
    ecrRepo: ecrStack.ecrRepo
});

const pipeline = new CICDPipeline(app, 'CicdStack', {
    ecrRepo: ecrStack.ecrRepo,
    fargateService: ecsStack.fargateService
});