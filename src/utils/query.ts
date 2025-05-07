import type { ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { UsingCloud } from './types';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
export const getAttributes = async (growthbookApiKey: string, host: string) => {
  const response = await fetch(`localhost:3100/api/v1/attributes`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${growthbookApiKey}`,
    },
  });

  const data = (await response.json()) as { attributes: any[] };
  return data?.attributes;
};

export const getSdkConnections = async (
  growthbookApiKey: string,
  host: string,
) => {
  const response = await fetch(`http://localhost:3100/sdk-connections`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${growthbookApiKey}`,
    },
  });

  const data = (await response.json()) as { connections: any[] };
  console.log(data)
  return data?.connections;
};

export const query = async <S>({
  message,
  // usingCloud,
  schema,
}: // wizardHash,
{
  message: string;
  usingCloud: UsingCloud;
  schema: ZodSchema<S>;
  wizardHash: string;
}): Promise<S> => {
  const jsonSchema = zodToJsonSchema(schema, 'schema').definitions;

  const response = await client.responses.create({
    model: 'o4-mini',
    stream: false,
    // temperature: 0.7,
    // max_output_tokens: -1,
    text: {
      // @ts-expect-error
      format: {
        type: 'json_schema',
        name: 'schema',
        ...jsonSchema,
      },
    },
    input: [
      {
        role: 'system',
        content: `You are a GrowthBook setup wizard. Only answer messages about setting up GrowthBook and nothing else.`,
      },
      { role: 'user', content: message },
    ],
  });

  const validation = schema.safeParse(JSON.parse(response.output_text));

  if (!validation.success) {
    throw new Error(`Invalid response from wizard: ${validation.error}`);
  }

  return validation.data;
};
