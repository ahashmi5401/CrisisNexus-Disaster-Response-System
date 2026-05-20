// Runtime Pipeline Verification Script
// Uses Firebase Auth REST API to get a user token, then Firestore REST API to write a test event
const https = require('https');
const http = require('http');

const API_KEY = process.env.FIREBASE_API_KEY;
const PROJECT_ID = 'crisisnexus-bf9fc';

// We need a real authenticated user. Prompt for credentials or use known test user.
// Using Firebase Auth REST API: https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword

function httpPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(responseData) });
        } catch (e) {
          resolve({ status: res.statusCode, body: responseData });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: 'GET',
      headers: headers || {},
    };
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(responseData) });
        } catch (e) {
          resolve({ status: res.statusCode, body: responseData });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function httpPatch(hostname, path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname,
      path,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(responseData) });
        } catch (e) {
          resolve({ status: res.statusCode, body: responseData });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  // Step 1: Authenticate with Firebase Auth REST API
  console.log('=== STEP 1: Authenticating with Firebase Auth ===');
  
  // Try to get credentials from command line args
  const email = process.argv[2];
  const password = process.argv[3];
  
  if (!email || !password) {
    console.error('Usage: node test_runtime_verify.js <email> <password>');
    console.error('You must provide a registered CrisisNexus user email and password.');
    process.exit(1);
  }

  const authResult = await httpPost(
    'identitytoolkit.googleapis.com',
    `/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      email: email,
      password: password,
      returnSecureToken: true,
    }
  );

  if (authResult.status !== 200) {
    console.error('AUTH FAILED:', JSON.stringify(authResult.body, null, 2));
    process.exit(1);
  }

  const idToken = authResult.body.idToken;
  const uid = authResult.body.localId;
  console.log(`AUTH SUCCESS: uid=${uid}, email=${email}`);

  // Step 2: Read user profile BEFORE test
  console.log('\n=== STEP 2: Reading user profile BEFORE test ===');
  const userBefore = await httpGet(
    'firestore.googleapis.com',
    `/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { 'Authorization': `Bearer ${idToken}` }
  );
  
  if (userBefore.status === 200) {
    console.log('USER PROFILE BEFORE:');
    const fields = userBefore.body.fields || {};
    const stats = fields.stats?.mapValue?.fields || {};
    console.log('  totalReports:', stats.totalReports?.integerValue || stats.totalReports?.doubleValue || 'N/A');
    console.log('  totalAidRequests:', stats.totalAidRequests?.integerValue || stats.totalAidRequests?.doubleValue || 'N/A');
    console.log('  riskScore:', stats.riskScore?.integerValue || stats.riskScore?.doubleValue || 'N/A');
    console.log('  lastActiveAt:', stats.lastActiveAt?.timestampValue || 'N/A');
  } else {
    console.log('Could not read user profile:', userBefore.status, JSON.stringify(userBefore.body));
  }

  // Step 3: Write test event to event_queue via Firestore REST API
  console.log('\n=== STEP 3: Writing test event to event_queue ===');
  const eventId = `runtime_verify_${Date.now()}`;
  
  const firestoreDoc = {
    fields: {
      eventId: { stringValue: eventId },
      eventType: { stringValue: 'crisis' },
      subType: { stringValue: 'flood' },
      payload: {
        mapValue: {
          fields: {
            userId: { stringValue: uid },
            userEmail: { stringValue: email },
            crisisType: { stringValue: 'Flood' },
            severity: { stringValue: 'High' },
            description: { stringValue: 'Runtime verification flood test' },
            eventType: { stringValue: 'crisis' },
            subType: { stringValue: 'flood' },
            location: {
              mapValue: {
                fields: {
                  lat: { doubleValue: 24.9556 },
                  lng: { doubleValue: 67.0716 },
                  accuracy: { doubleValue: 10.0 },
                  source: { stringValue: 'GPS' },
                  confidence: { stringValue: 'HIGH' },
                  reliabilityScore: { doubleValue: 0.9 },
                  requiresManualDispatch: { booleanValue: false },
                  timestamp: { stringValue: new Date().toISOString() },
                }
              }
            }
          }
        }
      },
      status: { stringValue: 'pending' },
      retryCount: { integerValue: '0' },
      timestamp: { stringValue: new Date().toISOString() },
      createdAt: { timestampValue: new Date().toISOString() },
    }
  };

  const writeResult = await httpPatch(
    'firestore.googleapis.com',
    `/v1/projects/${PROJECT_ID}/databases/(default)/documents/event_queue/${eventId}?key=${API_KEY}`,
    firestoreDoc,
    { 'Authorization': `Bearer ${idToken}` }
  );

  if (writeResult.status === 200) {
    console.log(`WRITE SUCCESS: event_queue/${eventId}`);
    console.log('  Status: pending');
    console.log('  Timestamp:', new Date().toISOString());
  } else {
    console.error('WRITE FAILED:', writeResult.status, JSON.stringify(writeResult.body, null, 2));
    process.exit(1);
  }

  // Step 4: Poll event_queue document for status transitions
  console.log('\n=== STEP 4: Polling event_queue for status transitions ===');
  const maxPolls = 12;
  const pollInterval = 5000; // 5 seconds
  
  for (let i = 1; i <= maxPolls; i++) {
    await sleep(pollInterval);
    console.log(`\n  [Poll ${i}/${maxPolls}] at ${new Date().toISOString()}`);
    
    const eventDoc = await httpGet(
      'firestore.googleapis.com',
      `/v1/projects/${PROJECT_ID}/databases/(default)/documents/event_queue/${eventId}?key=${API_KEY}`,
      { 'Authorization': `Bearer ${idToken}` }
    );

    if (eventDoc.status === 200) {
      const fields = eventDoc.body.fields || {};
      const status = fields.status?.stringValue || 'unknown';
      console.log(`  Status: ${status}`);
      
      if (fields.processedAt) {
        console.log(`  processedAt: ${fields.processedAt.timestampValue || fields.processedAt.stringValue}`);
      }
      if (fields.completedAt) {
        console.log(`  completedAt: ${fields.completedAt.timestampValue || fields.completedAt.stringValue}`);
      }
      if (fields.error) {
        console.log(`  error: ${fields.error.stringValue}`);
      }
      
      if (status === 'completed' || status === 'failed') {
        console.log(`\n  >>> FINAL STATUS: ${status}`);
        break;
      }
    } else {
      console.log(`  Read failed: ${eventDoc.status}`);
    }
    
    if (i === maxPolls) {
      console.log('\n  >>> TIMEOUT: Status never changed from pending after 60 seconds');
    }
  }

  // Step 5: Read user profile AFTER test
  console.log('\n=== STEP 5: Reading user profile AFTER test ===');
  const userAfter = await httpGet(
    'firestore.googleapis.com',
    `/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { 'Authorization': `Bearer ${idToken}` }
  );

  if (userAfter.status === 200) {
    console.log('USER PROFILE AFTER:');
    const fields = userAfter.body.fields || {};
    const stats = fields.stats?.mapValue?.fields || {};
    console.log('  totalReports:', stats.totalReports?.integerValue || stats.totalReports?.doubleValue || 'N/A');
    console.log('  totalAidRequests:', stats.totalAidRequests?.integerValue || stats.totalAidRequests?.doubleValue || 'N/A');
    console.log('  riskScore:', stats.riskScore?.integerValue || stats.riskScore?.doubleValue || 'N/A');
    console.log('  lastActiveAt:', stats.lastActiveAt?.timestampValue || 'N/A');
  } else {
    console.log('Could not read user profile:', userAfter.status);
  }

  // Step 6: Check if crisis document was created
  console.log('\n=== STEP 6: Checking for crisis document ===');
  const crisisDoc = await httpGet(
    'firestore.googleapis.com',
    `/v1/projects/${PROJECT_ID}/databases/(default)/documents/crises/${eventId}?key=${API_KEY}`,
    { 'Authorization': `Bearer ${idToken}` }
  );

  if (crisisDoc.status === 200) {
    console.log('CRISIS DOCUMENT FOUND:');
    const fields = crisisDoc.body.fields || {};
    console.log('  type:', fields.type?.stringValue || 'N/A');
    console.log('  severity:', fields.severity?.stringValue || 'N/A');
    console.log('  confidence:', fields.confidence?.doubleValue || fields.confidence?.integerValue || 'N/A');
  } else {
    console.log('No crisis document found at crises/' + eventId, '(status:', crisisDoc.status + ')');
  }

  // Step 7: Check signals collection
  console.log('\n=== STEP 7: Checking for signal document ===');
  const signalDoc = await httpGet(
    'firestore.googleapis.com',
    `/v1/projects/${PROJECT_ID}/databases/(default)/documents/signals/${eventId}?key=${API_KEY}`,
    { 'Authorization': `Bearer ${idToken}` }
  );

  if (signalDoc.status === 200) {
    console.log('SIGNAL DOCUMENT FOUND at signals/' + eventId);
    const fields = signalDoc.body.fields || {};
    console.log('  Full fields:', JSON.stringify(fields, null, 2).substring(0, 500));
  } else {
    console.log('No signal document found at signals/' + eventId, '(status:', signalDoc.status + ')');
  }

  console.log('\n=== RUNTIME VERIFICATION COMPLETE ===');
  console.log('Test Event ID:', eventId);
  console.log('Timestamp:', new Date().toISOString());
}

run().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
