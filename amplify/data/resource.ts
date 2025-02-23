import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { sayHello } from "../functions/say-hello/resource";

const schema = a.schema({
  BedrockResponse: a.customType({
    body: a.string(),
    error: a.string(),
  }),

  askBedrock: a
      .query()
      .arguments({ ingredients: a.string().array() })
      .returns(a.ref("BedrockResponse"))
      .authorization((allow) => [allow.authenticated()])
      .handler(
          a.handler.custom({ entry: "./bedrock.js", dataSource: "bedrockDS" })
      ),

  sayHello: a
      .query()
      .arguments({
        name: a.string(),
      })
      .returns(a.string())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(sayHello)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "apiKey",
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});