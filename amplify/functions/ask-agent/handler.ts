import type { Schema } from "../../data/resource";
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const getParameter = async (key: string): Promise<string> => {
    const client = new SSMClient({ region: "us-east-1" });
    const input = { Name: key, WithDecryption: false };
    const command = new GetParameterCommand(input);
    const response = await client.send(command);

    return response.Parameter == undefined || response.Parameter.Value == undefined ? "" : response.Parameter.Value;
}

const invokeBedrockAgent = async (prompt: string, sessionId: string): Promise<string> => {
    const client = new BedrockAgentRuntimeClient({ region: "us-east-1" });
    const agentId = await getParameter("BEDROCK_AGENT_ID");
    const agentAliasId = await getParameter("BEDROCK_AGENT_ALIAS_ID");
    console.log(`Prepare to invoke Bedrock Agent: ${agentId}/${agentAliasId}, prompt: ${prompt}`);

    const command = new InvokeAgentCommand({
        agentId,
        agentAliasId,
        sessionId,
        inputText: prompt,
    });

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
        return "Something wrong";
    }
};

const getAnswer = async (question: string | undefined, sessionId: string | undefined): Promise<string> => {
    if (question == undefined || sessionId == undefined) {
        return "I don't know";
    }

    // If agent is not enabled, take a nap for some random seconds and return
    const bedrockAgentEnabled = await getParameter("BEDROCK_AGENT_ENABLED");
    if (bedrockAgentEnabled.toUpperCase() != "TRUE") {
        await new Promise(f => setTimeout(f, 2000 + 3000 * Math.random()))
        return "The answer to your question is 42."
    }

    else {
        return invokeBedrockAgent(question, sessionId);
    }
}

export const handler: Schema["askAgent"]["functionHandler"] = async (event) => {
    console.log(`Received event: ${JSON.stringify(event)}`);
    const question = event.arguments.question!;
    const sessionId = event.arguments.sessionId!;
    const answer = await getAnswer(question, sessionId);
    console.log(`Returning response: ${answer}`);

    return answer;
}