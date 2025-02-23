import type { Schema } from "../../data/resource";

export const handler: Schema["sayHello"]["functionHandler"] = async (event) => {
    // arguments typed from `.arguments()`
    console.log(`Received event: ${JSON.stringify(event)}`);
    const { name } = event.arguments;
    await new Promise(f => setTimeout(f, 2500));
    // return typed from `.returns()`
    const response = `Hello, ${name}!`;
    console.log(`Returning response: ${response}`);
    return response;
}