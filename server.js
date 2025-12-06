const express=require("express");
const bodyParser=require("body-parser");
const fetch=require("node-fetch");
const {GoogleAuth}=require("google-auth-library");
const sqlite3=require("sqlite3").verbose();
const path=require("path");

const app=express();
app.use(bodyParser.json());
app.use(express.static("public"));
app.use("/admin", express.static("admin"));

const db=new sqlite3.Database("./chat.db");
db.run("CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,userId TEXT,sessionId TEXT,sender TEXT,message TEXT,timestamp TEXT)");

const PIN="8888";

app.post("/admin/login",(req,res)=>{
 if(req.body.pin===PIN) res.json({ok:true});
 else res.json({ok:false});
});

app.get("/admin/messages",(req,res)=>{
 db.all("SELECT * FROM messages ORDER BY id DESC",(e,rows)=>{
  res.json(rows||[]);
 });
});

const SERVICE_ACCOUNT_PATH=path.join(__dirname,"gym-service-account.json");
const auth=new GoogleAuth({keyFilename:SERVICE_ACCOUNT_PATH,scopes:["https://www.googleapis.com/auth/cloud-platform"]});
async function getAccessToken(){ const client=await auth.getClient(); const {token}=await client.getAccessToken(); return token; }

const PROJECT_ID="gym-system-nuhj";
const LANGUAGE_CODE="ar";

app.post("/api/chat", async (req,res)=>{
 try{
  const text=req.body.text;
  const sessionId=req.body.sessionId;
  const accessToken=await getAccessToken();

  db.run("INSERT INTO messages(userId,sessionId,sender,message,timestamp) VALUES(?,?,?,?,datetime('now'))",
   ["user",sessionId,"user",text]);

  const url=`https://dialogflow.googleapis.com/v2/projects/${PROJECT_ID}/agent/sessions/${sessionId}:detectIntent`;
  const dfRes=await fetch(url,{
   method:"POST",
   headers:{
    "Content-Type":"application/json",
    "Authorization":"Bearer "+accessToken},
   body:JSON.stringify({queryInput:{text:{text,languageCode:LANGUAGE_CODE}}})
  });

  const data=await dfRes.json();
  const reply=data?.queryResult?.fulfillmentText||"معذرة، مش قادر أفهم سؤالك.";

  db.run("INSERT INTO messages(userId,sessionId,sender,message,timestamp) VALUES(?,?,?,?,datetime('now'))",
   ["user",sessionId,"agent",reply]);

  res.json({reply});
 }catch(e){
  res.json({reply:"خطأ في السيرفر"});
 }
});

app.listen(3000,()=>console.log("RUN http://localhost:3000"));
