import { defineBackend } from "@aws-amplify/backend";
import { data } from "./data/resource";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { auth } from "./auth/resource";
import { askAgent } from './functions/ask-agent/resource';
import {preSignUp} from "./auth/pre-sign-up/resource";

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

backend.preSignUp.resources.lambda.grantPrincipal.addToPrincipalPolicy(
    new PolicyStatement({
        resources: ["*"],
        actions: ["ssm:GetParameter"],
    })
);