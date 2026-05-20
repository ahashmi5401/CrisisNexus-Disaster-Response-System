const admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "crisisnexus-bf9fc"
  });
}
const auth = admin.auth();

async function run() {
  console.log("Fetching all Auth users...");
  const listUsersResult = await auth.listUsers(1000);
  const uids = listUsersResult.users.map(userRecord => userRecord.uid);
  
  if (uids.length === 0) {
    console.log("No auth users found.");
    return;
  }
  
  console.log(`Deleting ${uids.length} users...`);
  const deleteResult = await auth.deleteUsers(uids);
  console.log(`Successfully deleted ${deleteResult.successCount} users.`);
  if (deleteResult.failureCount > 0) {
    console.error(`Failed to delete ${deleteResult.failureCount} users.`);
    deleteResult.errors.forEach((err) => {
      console.error(err.error.toJSON());
    });
  }
}

run().catch(console.error);
