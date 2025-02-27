import axios from "axios";
import type { ZodSchema } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { CLOUD_URL } from "../../lib/Constants";

export const query = async <S>({ message, schema }: { message: string, schema: ZodSchema<S> }): Promise<S> => {

  const jsonSchema = zodToJsonSchema(schema, "schema").definitions;

  const response = await axios.post<{ data: unknown }>(`${CLOUD_URL}api/wizard/query`, {
    message,
    "json_schema": { ...jsonSchema, name: "schema", strict: true },
  });
  const validation = schema.safeParse(response.data.data);

  if (!validation.success) {
    throw new Error(`Invalid response from wizard: ${validation.error}`);
  }

  return validation.data;
};

