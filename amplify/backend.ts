import { defineBackend } from "@aws-amplify/backend";
import { data } from "./data/resource";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { auth } from "./auth/resource";
import { askAgent } from './functions/ask-agent/resource';
import {preSignUp} from "./auth/pre-sign-up/resource";
import {AttributeType, BillingMode, ProjectionType, TableEncryption, Table, CfnTable} from 'aws-cdk-lib/aws-dynamodb'

const backend = defineBackend({
    auth,
    data,
    askAgent,
    preSignUp
});

// https://docs.amplify.aws/react/build-a-backend/functions/grant-access-to-other-resources/#using-cdk
backend.askAgent.resources.lambda.grantPrincipal.addToPrincipalPolicy(
    new PolicyStatement({
        resources: ["*"],
        actions: ["bedrock:InvokeAgent"],
    })
);

backend.askAgent.resources.lambda.grantPrincipal.addToPrincipalPolicy(
    new PolicyStatement({
        resources: ["*"],
        actions: ["ssm:GetParameter"],
    })
);

backend.askAgent.resources.lambda.grantPrincipal.addToPrincipalPolicy(
    new PolicyStatement({
        resources: ["*"],
        actions: ["dynamodb:*"],
    })
);

backend.preSignUp.resources.lambda.grantPrincipal.addToPrincipalPolicy(
    new PolicyStatement({
        resources: ["*"],
        actions: ["ssm:GetParameter"],
    })
);

const backendStack = backend.createStack("BackendStack");

const table = new Table(backendStack, `AgentAccessLogDDBTable`, {
    partitionKey: {name: 'user_name', type: AttributeType.STRING},
    sortKey: {name: 'access_time', type: AttributeType.STRING},
    tableName: `AgentAccessLog`,
    pointInTimeRecovery: true,
    billingMode: BillingMode.PAY_PER_REQUEST,
    encryption: TableEncryption.AWS_MANAGED,
    deletionProtection: true
});