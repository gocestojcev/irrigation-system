import * as path from 'path';
import {
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  Tags,
  aws_apigateway as apigw,
  aws_cognito as cognito,
  aws_cloudwatch as cloudwatch,
  aws_cloudwatch_actions as cwActions,
  aws_dynamodb as dynamodb,
  aws_events as events,
  aws_events_targets as targets,
  aws_iam as iam,
  aws_iot as iot,
  aws_lambda as lambda,
  aws_lambda_nodejs as lambdaNode,
  aws_logs as logs,
  aws_sns as sns,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface IrrigationApiStackProps extends StackProps {
  stage: string;
  userPoolId: string;
}

export class IrrigationApiStack extends Stack {
  constructor(scope: Construct, id: string, props: IrrigationApiStackProps) {
    super(scope, id, props);

    Tags.of(this).add('name', 'irrigation');
    Tags.of(this).add('owner', 'irrigation-system');
    Tags.of(this).add('stage', props.stage);

    const accessTable = new dynamodb.Table(this, 'DeviceUserAccessTable', {
      tableName: `device_user_access_${props.stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: props.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    accessTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const commandsTable = new dynamodb.Table(this, 'CommandsTable', {
      tableName: `device_commands_${props.stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: props.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      timeToLiveAttribute: 'ttl',
    });

    const logsTable = new dynamodb.Table(this, 'DeviceLogsTable', {
      tableName: `device_logs_${props.stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: props.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      timeToLiveAttribute: 'ttl',
    });

    const defaultFnProps: Omit<lambdaNode.NodejsFunctionProps, 'entry'> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: Duration.seconds(10),
      bundling: {
        sourceMap: true,
        minify: false,
      },
      environment: {
        ACCESS_TABLE_NAME: accessTable.tableName,
        COMMANDS_TABLE_NAME: commandsTable.tableName,
        LOGS_TABLE_NAME: logsTable.tableName,
        COMMAND_TIMEOUT_SECONDS: '120',
        STAGE: props.stage,
      },
    };

    const createHandler = (idSuffix: string, entryRelPath: string): lambdaNode.NodejsFunction => {
      const functionName = `irrigation-${props.stage}-${idSuffix.toLowerCase()}`;
      const logGroup = new logs.LogGroup(this, `${idSuffix}LogGroup`, {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: props.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      });

      const fn = new lambdaNode.NodejsFunction(this, `${idSuffix}Fn`, {
        ...defaultFnProps,
        functionName,
        logGroup,
        entry: path.join(__dirname, '..', '..', entryRelPath),
      });

      accessTable.grantReadData(fn);
      commandsTable.grantReadData(fn);
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['iot:GetThingShadow', 'iot:UpdateThingShadow'],
          resources: [this.formatArn({ service: 'iot', resource: 'thing', resourceName: '*' })],
        }),
      );

      return fn;
    };

    const getStatusFn = createHandler('GetStatus', 'lambdas/handlers/get-status.ts');
    const getLineFn = createHandler('GetLine', 'lambdas/handlers/get-line.ts');
    const postLineFn = createHandler('PostLine', 'lambdas/handlers/post-line.ts');
    const getScheduleFn = createHandler('GetSchedule', 'lambdas/handlers/get-schedule.ts');
    const postScheduleFn = createHandler('PostSchedule', 'lambdas/handlers/post-schedule.ts');
    const getLogsFn = createHandler('GetLogs', 'lambdas/handlers/get-logs.ts');
    const postLogsClearFn = createHandler('PostLogsClear', 'lambdas/handlers/post-logs-clear.ts');
    const getCommandStatusFn = createHandler('GetCommandStatus', 'lambdas/handlers/get-command-status.ts');
    const ingestCommandResultFn = createHandler('IngestCommandResult', 'lambdas/handlers/ingest-command-result.ts');
    const ingestLogEventFn = createHandler('IngestLogEvent', 'lambdas/handlers/ingest-log-event.ts');
    const timeoutCommandsFn = createHandler('TimeoutCommands', 'lambdas/handlers/timeout-commands.ts');

    logsTable.grantReadData(getLogsFn);
    logsTable.grantWriteData(ingestLogEventFn);
    logsTable.grantReadWriteData(postLogsClearFn);

    commandsTable.grantWriteData(postLineFn);
    commandsTable.grantWriteData(postScheduleFn);
    commandsTable.grantWriteData(postLogsClearFn);
    commandsTable.grantWriteData(ingestCommandResultFn);
    commandsTable.grantWriteData(timeoutCommandsFn);

    const importedUserPool = cognito.UserPool.fromUserPoolId(this, 'ImportedUserPool', props.userPoolId);

    const api = new apigw.RestApi(this, 'IrrigationApi', {
      restApiName: `irrigation-api-${props.stage}`,
      deployOptions: {
        stageName: props.stage,
        metricsEnabled: true,
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const cognitoAuthorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'ApiCognitoAuthorizer', {
      cognitoUserPools: [importedUserPool],
      authorizerName: `irrigation-cognito-authorizer-${props.stage}`,
      resultsCacheTtl: Duration.minutes(5),
    });

    const authMethodOptions: apigw.MethodOptions = {
      authorizationType: apigw.AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    };

    const devices = api.root.addResource('devices');
    const device = devices.addResource('{deviceId}');

    const status = device.addResource('status');
    status.addMethod('GET', new apigw.LambdaIntegration(getStatusFn), authMethodOptions);

    const line = device.addResource('line');
    const lineId = line.addResource('{lineId}');
    lineId.addMethod('GET', new apigw.LambdaIntegration(getLineFn), authMethodOptions);
    lineId.addMethod('POST', new apigw.LambdaIntegration(postLineFn), authMethodOptions);

    const schedule = device.addResource('schedule');
    const scheduleId = schedule.addResource('{lineId}');
    scheduleId.addMethod('GET', new apigw.LambdaIntegration(getScheduleFn), authMethodOptions);
    scheduleId.addMethod('POST', new apigw.LambdaIntegration(postScheduleFn), authMethodOptions);

    const logsResource = device.addResource('logs');
    logsResource.addMethod('GET', new apigw.LambdaIntegration(getLogsFn), authMethodOptions);
    const logsClear = logsResource.addResource('clear');
    logsClear.addMethod('POST', new apigw.LambdaIntegration(postLogsClearFn), authMethodOptions);

    const commands = device.addResource('commands');
    const commandId = commands.addResource('{commandId}');
    commandId.addMethod('GET', new apigw.LambdaIntegration(getCommandStatusFn), authMethodOptions);

    const commandResultRuleName = `irrigation_command_result_${props.stage}`;
    const commandResultRule = new iot.CfnTopicRule(this, 'CommandResultTopicRule', {
      ruleName: commandResultRuleName,
      topicRulePayload: {
        sql: "SELECT topic(3) as deviceId, commandId, status, updatedAt, appliedAt, errorCode, errorMessage FROM 'irrigation/devices/+/command-result'",
        actions: [
          {
            lambda: {
              functionArn: ingestCommandResultFn.functionArn,
            },
          },
        ],
        ruleDisabled: false,
        awsIotSqlVersion: '2016-03-23',
      },
    });

    ingestCommandResultFn.addPermission('AllowIotInvokeIngestCommandResult', {
      principal: new iam.ServicePrincipal('iot.amazonaws.com'),
      action: 'lambda:InvokeFunction',
    });

    const logEventRuleName = `irrigation_log_event_${props.stage}`;
    new iot.CfnTopicRule(this, 'LogEventTopicRule', {
      ruleName: logEventRuleName,
      topicRulePayload: {
        sql: "SELECT topic(3) as deviceId, Epoch, Time, Line, Event, Source, DurationSec, DurationMin FROM 'irrigation/devices/+/logs'",
        actions: [
          {
            lambda: {
              functionArn: ingestLogEventFn.functionArn,
            },
          },
        ],
        ruleDisabled: false,
        awsIotSqlVersion: '2016-03-23',
      },
    });

    ingestLogEventFn.addPermission('AllowIotInvokeIngestLogEvent', {
      principal: new iam.ServicePrincipal('iot.amazonaws.com'),
      action: 'lambda:InvokeFunction',
    });

    new events.Rule(this, 'CommandTimeoutSweepSchedule', {
      description: 'Sweep stale pending commands and mark as timeout',
      schedule: events.Schedule.rate(Duration.minutes(5)),
      targets: [new targets.LambdaFunction(timeoutCommandsFn)],
    });

    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `irrigation-alarms-${props.stage}`,
    });

    const api5xxAlarm = new cloudwatch.Alarm(this, 'Api5xxAlarm', {
      alarmName: `irrigation-api-5xx-${props.stage}`,
      metric: api.metricServerError({ period: Duration.minutes(5), statistic: 'sum' }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });

    api5xxAlarm.addAlarmAction(new cwActions.SnsAction(alarmTopic));

    const lambdaErrorsAlarm = new cloudwatch.Alarm(this, 'LambdaErrorsAlarm', {
      alarmName: `irrigation-lambda-errors-${props.stage}`,
      metric: getStatusFn.metricErrors({ period: Duration.minutes(5), statistic: 'sum' }),
      threshold: 3,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });

    lambdaErrorsAlarm.addAlarmAction(new cwActions.SnsAction(alarmTopic));
  }
}
