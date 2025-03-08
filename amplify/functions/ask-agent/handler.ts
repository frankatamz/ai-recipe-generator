import type { Schema } from "../../data/resource";
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { DynamoDBClient, PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";

const RESPONSE_SERVER_SIDE_ERROR = "Something is wrong.";
const RESPONSE_DEFAULT = "The answer to your question is 42.";
const RESPONSE_RATE_LIMIT_EXCEEDED = "Request exceeds rate limit, please slow down.";
const TABLE_NAME = "AgentAccessLog";
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
    const client = new BedrockAgentRuntimeClient({ region: REGION});

    try {
        let completion = "";
        const response = await client.send(command);

        if (response.completion === undefined) {
            throw new Error("Completion is undefined");
        }

        for await (const chunkEvent of response.completion) {
            const chunk = chunkEvent.chunk;
            console.log(chunk);
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
    const sessionId = event.arguments.sessionId;
    const mode = event.arguments.mode;

    // If agent is not enabled, take a nap for some random seconds and return
    const bedrockAgentEnabled = await getParameter("BEDROCK_AGENT_ENABLED");
    if (bedrockAgentEnabled.toUpperCase() != "TRUE") {
        await new Promise(f => setTimeout(f, 2000 + 3000 * Math.random()));
        return RESPONSE_DEFAULT;
    }

    else {
        return invokeBedrockAgent(question, sessionId, mode);
    }
}

const logUserAccess = async (event: any) => {
    const user_name = event.identity.username;
    const question = event.arguments.question;
    const access_time = new Date().toISOString();
    console.log(`Prepare to log access for user_name: ${user_name}, access_time: ${access_time} to table: ${TABLE_NAME}`);

    const params = {
        TableName: TABLE_NAME,
        Item: {
            user_name: { S: user_name },
            access_time: { S: access_time},
            question: { S: question},
        },
    };
    const command = new PutItemCommand(params);
    const client = new DynamoDBClient({ region: REGION });

    try {
        const response = await client.send(command);
        console.log("Success", response);
    } catch (error) {
        console.error("Error", error);
    }
}

// Implement simple rate limiting functionality, where each user cannot exceed {max_count} number of requests per {duration_in_minutes}.
const isRateLimited = async (event: any, duration_in_minutes: number, max_count: number) => {
    const user_name = event.identity.username;
    const end_time = new Date();
    const start_time = new Date(end_time);
    start_time.setMinutes(end_time.getMinutes() - duration_in_minutes);
    console.log(`Prepare query table: ${TABLE_NAME} with user_name: ${user_name}, access_time between: ${start_time.toISOString()} and: ${end_time.toISOString()}`);

    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: "user_name = :pk AND access_time BETWEEN :sk1 AND :sk2",
        ExpressionAttributeValues: {
            ":pk": { S: user_name },
            ":sk1": { S: start_time.toISOString() },
            ":sk2": { S: end_time.toISOString() }
        },
    };

    const client = new DynamoDBClient({ region: "us-east-1" });
    const command = new QueryCommand(params);

    try {
        const response = await client.send(command);
        console.log(response.Items);
        const rateLimited = response.Items!.length >= max_count;
        console.log(`Found ${response.Items!.length} record(s). Applying max_count: ${max_count}, the returned value of isRateLimited is: ${rateLimited}`)
        return rateLimited;
    } catch (error) {
        console.error(error);
        return false;
    }
}

export const handler: Schema["askAgent"]["functionHandler"] = async (event) => {
    console.log(`Received event: ${JSON.stringify(event)}`);
    const duration_in_minutes =  await getParameter("DURATION_IN_MINUTES");
    const max_count = await getParameter("MAX_COUNT");
    const rateLimited = await isRateLimited(event, Number(duration_in_minutes), Number(max_count));
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