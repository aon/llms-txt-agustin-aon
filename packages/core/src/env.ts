/** Environment every process that talks to the stack receives, worker and web alike. */
export const RESOURCE_ENV = {
  tableName: "TABLE_NAME",
  bucketName: "BUCKET_NAME",
  queueUrl: "QUEUE_URL",
} as const;

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
