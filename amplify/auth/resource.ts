import { defineAuth } from "@aws-amplify/backend";
import { preSignUp } from './pre-sign-up/resource';

export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: "CODE",
      verificationEmailSubject: "Welcome to the AI-Powered Recipe Generator!",
      verificationEmailBody: (createCode) =>
        `Use this code to confirm your account: ${createCode()}`,
    },
  },
  triggers: {
    preSignUp
  }
});
