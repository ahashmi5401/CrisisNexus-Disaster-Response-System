// Minimal test: uses Firebase REST API only (no SDK needed)
// Usage: node test_rest.js <email> <password>

const https = require('https');

const API_KEY = process.env.FIREBASE_API_KEY;
const PROJECT_ID = 'crisisnexus-bf9fc';

function post(hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname, path, method: body ? 'PATCH' : 'GET',
      headers: { 'Content-Type': 'application/json', ...headers }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ s: res.statusCode, b: JSON.parse(d) }); }
        catch { resolve({ s: res.statusCode, b: d }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(data);
    req.end();
  });
}

function get(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path, method: 'GET',
      headers: { ...headers }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ s: res.statusCode, b: JSON.parse(d) }); }
        catch { resolve({ s: res.statusCode, b: d }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const email = process.argv[2];
  const pass = process.argv[3];
  if (!email || !pass) {
    console.log('Usage: node test_rest.js <email> <password>');
    process.exit(1);
  }

  // Auth
  console.log('[1] Authenticating...');
  const authData = JSON.stringify({ email, password: pass, returnSecureToken: true });
  const auth = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      path: `/v1/accounts:signInWithPassword?key=${API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ s: res.statusCode, b: JSON.parse(d) }));
    });
    req.on('error', reject);
    req.write(authData);
    req.end();
  });

  if (auth.s !== 200) {
    console.log('AUTH FAIL:', auth.b.error?.message || auth.b);
    process.exit(1);
  }
  const token = auth.b.idToken;
  const uid = auth.b.localId;
  console.log(`  OK: uid=${uid}`);

  // Read user BEFORE
  console.log('\n[2] User profile BEFORE:');
  const ub = await get('firestore.googleapis.com',
    `/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { Authorization: `Bearer ${token}` });
  if (ub.s === 200) {
    const st = ub.b.fields?.stats?.mapValue?.fields || {};
    console.log('  totalReports:', st.totalReports?.integerValue || '0');
    console.log('  riskScore:', st.riskScore?.integerValue || st.riskScore?.doubleValue || '0');
    console.log('  lastActiveAt:', st.lastActiveAt?.timestampValue || 'none');
  } else console.log('  Cannot read:', ub.s);

  // Write event
  const eid = `rv_${Date.now()}`;
  console.log(`\n[3] Writing event_queue/${eid}...`);
  const doc = {
    fields: {
      eventId: { stringValue: eid },
      eventType: { stringValue: 'crisis' },
      subType: { stringValue: 'flood' },
      payload: { mapValue: { fields: {
        userId: { stringValue: uid },
        userEmail: { stringValue: email },
        crisisType: { stringValue: 'Flood' },
        severity: { stringValue: 'High' },
        description: { stringValue: 'Runtime verification flood test' },
        eventType: { stringValue: 'crisis' },
        subType: { stringValue: 'flood' },
        location: { mapValue: { fields: {
          lat: { doubleValue: 24.9556 },
          lng: { doubleValue: 67.0716 },
          accuracy: { doubleValue: 10 },
          source: { stringValue: 'GPS' },
          confidence: { stringValue: 'HIGH' },
          reliabilityScore: { doubleValue: 0.9 },
          requiresManualDispatch: { booleanValue: false },
          timestamp: { stringValue: new Date().toISOString() }
        }}}
      }}},
      status: { stringValue: 'pending' },
      retryCount: { integerValue: '0' },
      timestamp: { stringValue: new Date().toISOString() },
      createdAt: { timestampValue: new Date().toISOString() }
    }
  };

  const wr = await new Promise((resolve, reject) => {
    const body = JSON.stringify(doc);
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/event_queue/${eid}`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ s: res.statusCode, b: JSON.parse(d) }); }
        catch { resolve({ s: res.statusCode, b: d }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  if (wr.s === 200) {
    console.log('  WRITE OK');
  } else {
    console.log('  WRITE FAIL:', wr.s, JSON.stringify(wr.b, null, 2));
    process.exit(1);
  }

  // Poll
  console.log('\n[4] Polling status (60s, every 5s)...');
  let finalStatus = 'pending';
  for (let i = 1; i <= 12; i++) {
    await sleep(5000);
    const r = await get('firestore.googleapis.com',
      `/v1/projects/${PROJECT_ID}/databases/(default)/documents/event_queue/${eid}`,
      { Authorization: `Bearer ${token}` });
    if (r.s === 200) {
      const f = r.b.fields || {};
      finalStatus = f.status?.stringValue || '?';
      const extra = [];
      if (f.processedAt) extra.push(`processedAt=${f.processedAt.timestampValue||f.processedAt.stringValue}`);
      if (f.completedAt) extra.push(`completedAt=${f.completedAt.timestampValue||f.completedAt.stringValue}`);
      if (f.error) extra.push(`error=${f.error.stringValue}`);
      console.log(`  [${i}] status=${finalStatus} ${extra.join(' ')}`);
      if (finalStatus === 'completed' || finalStatus === 'failed') break;
    }
  }

  // User AFTER
  console.log('\n[5] User profile AFTER:');
  const ua = await get('firestore.googleapis.com',
    `/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { Authorization: `Bearer ${token}` });
  if (ua.s === 200) {
    const st = ua.b.fields?.stats?.mapValue?.fields || {};
    console.log('  totalReports:', st.totalReports?.integerValue || '0');
    console.log('  riskScore:', st.riskScore?.integerValue || st.riskScore?.doubleValue || '0');
    console.log('  lastActiveAt:', st.lastActiveAt?.timestampValue || 'none');
  }

  // Crisis doc
  console.log('\n[6] Crisis document check:');
  const cr = await get('firestore.googleapis.com',
    `/v1/projects/${PROJECT_ID}/databases/(default)/documents/crises/${eid}`,
    { Authorization: `Bearer ${token}` });
  if (cr.s === 200) {
    const f = cr.b.fields || {};
    console.log('  FOUND! type:', f.type?.stringValue, 'severity:', f.severity?.stringValue);
  } else {
    console.log('  Not found (status', cr.s, ')');
  }

  // Signal doc
  console.log('\n[7] Signal document check:');
  const sg = await get('firestore.googleapis.com',
    `/v1/projects/${PROJECT_ID}/databases/(default)/documents/signals/${eid}`,
    { Authorization: `Bearer ${token}` });
  if (sg.s === 200) {
    console.log('  FOUND!');
  } else {
    console.log('  Not found (status', sg.s, ')');
  }

  console.log('\n=============================');
  console.log('FINAL STATUS:', finalStatus);
  console.log('EVENT ID:', eid);
  console.log('=============================');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
