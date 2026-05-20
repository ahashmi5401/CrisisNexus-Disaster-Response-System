const admin = require("firebase-admin");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");

const serviceAccount = require("../service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const server = new Server({
  name: "firestore-mcp",
  version: "1.0.0",
});

/**
 * TOOL 1 — schema inspection
 */
server.tool("getCollectionSchema", async ({ collection }) => {
  const snap = await db.collection(collection).limit(5).get();

  const docs = snap.docs.map(d => d.data());
  const sample = docs[0] || {};

  return {
    fields: Object.keys(sample),
    sampleDocs: docs,
  };
});

/**
 * TOOL 2 — safe query
 */
server.tool("queryCollection", async ({ collection, limit = 10 }) => {
  const snap = await db.collection(collection).limit(limit).get();

  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
});

server.listen(3005);
console.log("Firestore MCP running on port 3005");