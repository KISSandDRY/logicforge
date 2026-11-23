import { z, type ZodType } from 'zod';
import { HttpError } from '../utils/asyncHandler';

export function parseOrThrow<T>(
  schema: ZodType<T>,
  input: unknown,
  message: string,
  includeDetails = true,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(400, message, includeDetails ? z.flattenError(parsed.error) : undefined);
  }
  return parsed.data;
}
