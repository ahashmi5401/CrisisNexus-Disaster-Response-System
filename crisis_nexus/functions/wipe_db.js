const admin = require("firebase-admin");
const path = require("path");

const credPath = path.join(__dirname, "firebase-admin-creds.json");
process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "crisisnexus-bf9fc"
  });
}

const db = admin.firestore();

async function deleteCollection(db, collectionPath, batchSize) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(db, query, resolve) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    // When there are no documents left, we are done
    resolve();
    return;
  }

  // Delete documents in a batch
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
}

async function wipeAllExceptUsers() {
  const collections = await db.listCollections();
  for (const collection of collections) {
    if (collection.id !== 'users') {
      console.log(`Deleting collection: ${collection.id}`);
      await deleteCollection(db, collection.id, 500);
      console.log(`Finished deleting: ${collection.id}`);
    } else {
      console.log(`Skipping collection: ${collection.id}`);
    }
  }
}

wipeAllExceptUsers().then(() => {
  console.log("Database wipe complete.");
  process.exit(0);
}).catch(console.error);
