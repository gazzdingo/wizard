import { ChatOpenAI } from "@langchain/openai";

export const llm = new ChatOpenAI({
  // These are ignored, the wizard uses whatever is set on the server.
  model: 'o3-mini',
  temperature: 0,
  apiKey: process.env.POSTHOG_WIZARD_OPENAI_API_KEY,
});
