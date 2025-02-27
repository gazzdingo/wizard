import axios from "axios";
import type { ZodSchema } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { CLOUD_URL } from "../../lib/Constants";

export const query = async <S>({ message, schema }: { message: string, schema: ZodSchema<S> }): Promise<S> => {

  const jsonSchema = zodToJsonSchema(schema, "jsonSchema").definitions?.schema;

  console.log(`curl -X GET "${CLOUD_URL}/api/wizard/query?message=${message}&schema=${jsonSchema}"`);


  const response = await axios.get<{ data: unknown }>(`${CLOUD_URL}/api/wizard/query`, {
    params: {
      message,
      schema: jsonSchema,
    },
  })
  const validation = schema.safeParse(response.data.data);

  if (!validation.success) {
    throw new Error(`Invalid response from wizard: ${validation.error}`);
  }

  return validation.data;
};

