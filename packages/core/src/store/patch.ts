/**
 * A partial update. Every key is optional; an explicit `undefined` means
 * "remove this attribute", which DynamoDB expresses as REMOVE.
 */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };
