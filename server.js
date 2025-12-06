const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const { GoogleAuth } = require("google-auth-library");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));
app.use("/admin", express.static("admin"));

// ================================
// DATABASE
// ================================
const db = new sqlite3.Database("./chat.db");

db.run(
  "CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT, sessionId TEXT, sender TEXT, message TEXT, timestamp TEXT)"
);

// ================================
// ADMIN PIN
// ================================
const PIN = "8888";

app.post("/admin/login", (req, res) => {
  if (req.body.pin === PIN) res.json({ ok: true });
  else res.json({ ok: false });
});

app.get("/admin/messages", (req, res) => {
  db.all("SELECT * FROM messages ORDER BY id DESC", (e, rows) => {
    res.json(rows || []);
  });
});

// ================================
// SERVICE ACCOUNT — SAFE VERSION
// ================================

// هنا بنقرأ ملف الخدمة من Environment Variable
const serviceAccountJSON = process.env.SERVICE_ACCOUNT_JSON;

if (!serviceAccountJSON) {
  console.error("❌ ERROR: SERVICE_ACCOUNT_JSON is missing!");
  process.exit(1);
}

// نحوله لملف service.json داخل runtime
fs.writeFileSync("service.json", serviceAccountJSON);

const SERVICE_ACCOUNT_PATH = path.join(__dirname, "service.json");

const auth = new GoogleAuth({
  keyFilename: SERVICE_ACCOUNT_PATH,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

async function getAccessToken() {
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

// ================================
// DIALOGFLOW SETTINGS
// ================================
const PROJECT_ID = "gym-system-nuhj";
const LANGUAGE_CODE = "ar";

// ================================
// CHAT ENDPOINT
// ================================
app.post("/api/chat", async (req, res) => {
  try {
    const text = req.body.text;
    const sessionId = req.body.sessionId;
    const accessToken = await getAccessToken();

    // SAVE USER MESSAGE
    db.run(
      "INSERT INTO messages(userId,sessionId,sender,message,timestamp) VALUES(?,?,?,?,datetime('now'))",
      ["user", sessionId, "user", text]
    );

    const url = `https://dialogflow.googleapis.com/v2/projects/${PROJECT_ID}/agent/sessions/${sessionId}:detectIntent`;

    const dfRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + accessToken,
      },
      body: JSON.stringify({
        queryInput: { text: { text, languageCode: LANGUAGE_CODE } },
      }),
    });

    const data = await dfRes.json();
    const reply =
      data?.queryResult?.fulfillmentText ||
      "معذرة، مش قادر أفهم سؤالك حالياً.";

    // SAVE BOT MESSAGE
    db.run(
      "INSERT INTO messages(userId,sessionId,sender,message,timestamp) VALUES(?,?,?,?,datetime('now'))",
      ["user", sessionId, "agent", reply]
    );

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.json({ reply: "خطأ في السيرفر" });
  }
});

// ================================
// START SERVER
// ================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
