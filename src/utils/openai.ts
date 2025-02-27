import { ChatOpenAI } from "@langchain/openai";

let _openai: ChatOpenAI | undefined;

export const getOpenAi = () => {
  if (!_openai) {
    _openai = new ChatOpenAI({
      model: 'o3-mini',
      temperature: 1,
      apiKey: process.env.POSTHOG_WIZARD_OPENAI_API_KEY,

    });
  }
  return _openai;
};
