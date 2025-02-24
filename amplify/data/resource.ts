import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { askAgent } from "../functions/ask-agent/resource";

const schema = a.schema({
  askAgent: a
      .query()
      .arguments({
        question: a.string(),
        sessionId: a.string()
      })
      .returns(a.string())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(askAgent)),
});

export type Schema = ClientSchema<typeof schema>;

// https://docs.amplify.aws/vue/build-a-backend/data/customize-authz/
export const data = defineData({
    schema,
    authorizationModes: {
        defaultAuthorizationMode: "userPool",
    },
});