import type { PreSignUpTriggerHandler } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const getParameters = async (key: string): Promise<string[]> => {
    const client = new SSMClient({ region: "us-east-1" });
    const input = { Name: key, WithDecryption: false };
    const command = new GetParameterCommand(input);
    const response = await client.send(command);

    return response.Parameter == undefined || response.Parameter.Value == undefined
        ? []
        : response.Parameter.Value.split(",");
}

export const handler: PreSignUpTriggerHandler = async (event) => {
    const email = event.request.userAttributes['email'];
    const allowlistedEmails: string[] = await getParameters("ALLOWLISTED_EMAILS");
    console.log(`Allowlisted emails: ${allowlistedEmails}`);

    const isEmailAllowlisted = allowlistedEmails.map(item=>item.trim().toLowerCase()).includes(email.toLowerCase());
    console.log(`Email: ${email} has allowlist status: ${isEmailAllowlisted}`);

    if (!isEmailAllowlisted) {
        await new Promise(f => setTimeout(f, 5000))
        throw new Error('Invalid email');
    }

    return event;
};