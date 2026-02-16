import { Collection } from "@callumalpass/mdbase";

export async function openCollection(collectionPath: string): Promise<Collection> {
  const opened = await Collection.open(collectionPath);
  if (opened.error || !opened.collection) {
    throw new Error(opened.error?.message ?? `Failed to open collection at ${collectionPath}`);
  }
  return opened.collection;
}

export async function withCollection<T>(collectionPath: string, fn: (collection: Collection) => Promise<T>): Promise<T> {
  const collection = await openCollection(collectionPath);
  try {
    return await fn(collection);
  } finally {
    await collection.close();
  }
}
