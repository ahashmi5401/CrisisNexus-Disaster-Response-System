const fetch = require('node-fetch'); // wait, is node-fetch available or does the global fetch work in Node 20? Let's use global fetch first, or try/catch with require('node-fetch') if needed. Since Node 20 has global fetch built-in, we can just use global.fetch.

const GEMINI_KEY = "AIzaSyDdqqPuwQ-5hZVTEOdKw_8-N1epExxP5MM";

async function main() {
  console.log("Testing Gemini API directly with key: " + GEMINI_KEY);
  const prompt = "Analyze a crisis report: 'Heavy rain in the downtown area causing street flooding.' Respond with a JSON object that has a systemExplanation field.";
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });

    console.log("Response status:", response.status);
    console.log("Response OK:", response.ok);
    const text = await response.text();
    console.log("Response text:", text);
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

main();
