/**
 * Physical layout of the single DynamoDB table. The CDK stack and the store
 * implementation both read these so the two can never disagree.
 */
export const TABLE = {
  partitionKey: "pk",
  sortKey: "sk",
  gsi1: { name: "gsi1", partitionKey: "gsi1pk", sortKey: "gsi1sk" },
  gsi2: { name: "gsi2", partitionKey: "gsi2pk", sortKey: "gsi2sk" },
} as const;

/** Primary key attributes of every item. Derived from TABLE so names cannot drift. */
export type PrimaryKey = Record<
  typeof TABLE.partitionKey | typeof TABLE.sortKey,
  string
>;

/** Key attributes of the first global secondary index. */
export type Gsi1Key = {
  [TABLE.gsi1.partitionKey]: string;
  [TABLE.gsi1.sortKey]: string;
};

/** Key attributes of the second global secondary index. */
export type Gsi2Key = {
  [TABLE.gsi2.partitionKey]: string;
  [TABLE.gsi2.sortKey]: string;
};
