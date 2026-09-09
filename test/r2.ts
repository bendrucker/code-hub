export async function readObject(bucket: R2Bucket, key: string): Promise<ArrayBuffer | null> {
  const object = await bucket.get(key);

  return object === null ? null : object.arrayBuffer();
}

export async function emptyBucket(bucket: R2Bucket): Promise<void> {
  const listed = await bucket.list();
  await bucket.delete(listed.objects.map((object) => object.key));
}
