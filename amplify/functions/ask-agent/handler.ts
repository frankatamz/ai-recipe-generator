import type { Schema } from "../../data/resource";
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { DynamoDBClient, PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";

const RESPONSE_SERVER_SIDE_ERROR = "Something is wrong, please retry.";
const RESPONSE_DEFAULT = "The answer to your question is 42.";
const RESPONSE_RATE_LIMIT_EXCEEDED = "Request exceeds rate limit, please slow down.";
const RESPONSE_FEEDBACK_RECEIVED = "Thank you for your feedback."
const ACCESS_LOG_TABLE_NAME = "AgentAccessLog";
const REGION = "us-east-1";

const getParameter = async (key: string): Promise<string> => {
    const client = new SSMClient({ region: REGION });
    const input = { Name: key, WithDecryption: false };
    const command = new GetParameterCommand(input);
    const response = await client.send(command);

    return response.Parameter == undefined || response.Parameter.Value == undefined ? "" : response.Parameter.Value;
}

const invokeBedrockAgent = async (prompt: string, sessionId: string, mode: string): Promise<string> => {
    const agentId = await getParameter("BEDROCK_AGENT_ID");
    const agentAliasId = await getParameter(`BEDROCK_AGENT_${mode.toUpperCase()}_MODE_ALIAS_ID`);

    console.log(`Prepare to invoke Bedrock Agent: ${agentId}/${agentAliasId} (mode: ${mode}), prompt: ${prompt}, sessionId: ${sessionId}`);

    const command = new InvokeAgentCommand({
        agentId,
        agentAliasId,
        sessionId,
        inputText: prompt,
    });
    const client = new BedrockAgentRuntimeClient({ region: REGION });

    try {
        let completion = "";
        const response = await client.send(command);

        if (response.completion === undefined) {
            throw new Error("Response completion is undefined");
        }

        for await (const chunkEvent of response.completion) {
            const chunk = chunkEvent.chunk;
            if (chunk != undefined) {
                const decodedResponse = new TextDecoder("utf-8").decode(chunk.bytes);
                completion += decodedResponse;
            }
        }

        return completion;
    } catch (err: any) {
        console.error(err);
        return RESPONSE_SERVER_SIDE_ERROR;
    }
};

const getAnswer = async (event: any): Promise<string> => {
    const question = event.arguments.question;
    // Hack: for now we use username as sessionId so that the same user can maintain the same
    // conversation with the agent for as long as possible
    const sessionId = event.identity.username; // event.arguments.sessionId;
    const mode = event.arguments.mode;
    const bedrockAgentEnabled = await getParameter("BEDROCK_AGENT_ENABLED");

    // If this is a feedback, no need to invoke the agent
    if (question.toUpperCase().startsWith("#FEEDBACK")) {
        return RESPONSE_FEEDBACK_RECEIVED;
    }

    // If agent is not enabled, take a nap for some random seconds and return
    else if (bedrockAgentEnabled.toUpperCase() != "TRUE") {
        await new Promise(f => setTimeout(f, 2000 + 3000 * Math.random()));
        return RESPONSE_DEFAULT;
    }
    else {
        return invokeBedrockAgent(question, sessionId, mode);
    }
}

const logUserAccess = async (event: any) => {
    const userName = event.identity.username;
    const question = event.arguments.question;
    const accessTime = new Date().toISOString();
    console.log(`Prepare to log access for userName: ${userName}, accessTime: ${accessTime} to table: ${ACCESS_LOG_TABLE_NAME}`);

    const params = {
        TableName: ACCESS_LOG_TABLE_NAME,
        Item: {
            user_name: { S: userName },
            access_time: { S: accessTime},
            question: { S: question},
        },
    };
    const command = new PutItemCommand(params);
    const client = new DynamoDBClient({ region: REGION });

    await client.send(command);
}

// Implement simple rate limiting functionality, where each user cannot exceed {maxCount} number of requests per {durationInMinutes}.
const isRateLimited = async (event: any, durationInMinutes: number, maxCount: number) => {
    const userName = event.identity.username;
    const endTime = new Date();
    const startTime = new Date(endTime);
    startTime.setMinutes(endTime.getMinutes() - durationInMinutes);
    console.log(`Prepare query table: ${ACCESS_LOG_TABLE_NAME} with userName: ${userName}, accessTime between: ${startTime.toISOString()} and: ${endTime.toISOString()}`);

    const params = {
        TableName: ACCESS_LOG_TABLE_NAME,
        KeyConditionExpression: "user_name = :pk AND access_time BETWEEN :sk1 AND :sk2",
        ExpressionAttributeValues: {
            ":pk": { S: userName },
            ":sk1": { S: startTime.toISOString() },
            ":sk2": { S: endTime.toISOString() }
        },
    };

    const client = new DynamoDBClient({ region: REGION });
    const command = new QueryCommand(params);

    try {
        const response = await client.send(command);
        const count = response.Items!.length;
        const rateLimited = count >= maxCount;
        console.log(`Found ${count} record(s). Applying maxCount: ${maxCount}, the returned value of isRateLimited is: ${rateLimited}`)
        return rateLimited;
    } catch (error) {
        console.error(error);
        return false;
    }
}

export const handler: Schema["askAgent"]["functionHandler"] = async (event) => {
    console.log(`Received event: ${JSON.stringify(event)}`);
    const durationInMinutes =  await getParameter("DURATION_IN_MINUTES");
    const maxCount = await getParameter("MAX_COUNT");
    const rateLimited = await isRateLimited(event, Number(durationInMinutes), Number(maxCount));
    let answer;

    if (!rateLimited) {
        await logUserAccess(event);
        answer = await getAnswer(event);
    }
    else {
        await new Promise(f => setTimeout(f, 1000));
        answer = RESPONSE_RATE_LIMIT_EXCEEDED;
    }
    console.log(`Returning response: ${answer}`);

    return answer;
}