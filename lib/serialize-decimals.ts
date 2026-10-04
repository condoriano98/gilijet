/**
 * Recursively convert all Decimal objects to numbers for Server→Client serialization.
 * Prisma Decimal cannot cross the Server Component boundary.
 */
export function serializeDecimals<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'object') {
    if (obj.constructor.name === 'Decimal') {
      return Number(obj) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => serializeDecimals(item)) as unknown as T;
    }

    const result: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = serializeDecimals((obj as any)[key]);
      }
    }
    return result;
  }

  return obj;
}
