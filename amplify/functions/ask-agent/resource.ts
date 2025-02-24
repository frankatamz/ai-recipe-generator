import { defineFunction } from '@aws-amplify/backend';

// https://docs.amplify.aws/react/build-a-backend/functions/set-up-function/
export const askAgent = defineFunction({
    name: 'ask-agent',
    entry: './handler.ts',
    timeoutSeconds: 60
});