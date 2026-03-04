require("dotenv").config();

const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const path = require("path");
const crypto = require("crypto");

const { initializeDatabase, db } = require("./database/init");
const { executeQuery } = require("./services/sqlSandbox");

const app = express();

// Initialize DB
initializeDatabase();

// ================== CONFIG ==================

const LEVEL_ANSWERS = {
  1: 106,
  2: 297000,
  3: 738720,
  4: 20
};

const FINAL_PASSCODE = 1035846;

// ================== MIDDLEWARE ==================

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// ================== PREVENT BACK BUTTON CACHE ==================

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use(
  session({
    store: new SQLiteStore({
      db: "sessions.db",
      dir: "./server/database",
    }),
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

app.use(express.static(path.join(__dirname, "../public")));

// ================== PARTICIPANT ROUTES ==================

// Home
app.get("/", (req, res) => {

  // If already logged in → go to current level
  if (req.session.teamId) {

    const team = db.prepare(
      "SELECT current_level FROM teams WHERE id = ?"
    ).get(req.session.teamId);

    if (team) {
      return res.redirect(`/level/${team.current_level}`);
    }

  }

  res.render("participant/register");

});

// Register
app.post("/register", (req, res) => {
  const { team_name, email, member1, member2 } = req.body;

  const teamId = crypto.randomUUID();
  const startTime = Math.floor(Date.now() / 1000);

  try {
    db.prepare(`
      INSERT INTO teams 
      (id, team_name, email, member1, member2, start_time, current_level, status)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'active')
    `).run(teamId, team_name, email, member1, member2, startTime);

    req.session.teamId = teamId;

    res.redirect("/briefing");
  } catch (err) {
    res.send("Team name already exists.");
  }
});

// Dashboard
app.get("/dashboard", (req, res) => {

  if (!req.session.teamId) return res.redirect("/");

  const team = db.prepare("SELECT * FROM teams WHERE id = ?")
                 .get(req.session.teamId);

  if (!team) return res.redirect("/");

  const now = Math.floor(Date.now() / 1000);

  const duration = parseInt(process.env.EVENT_DURATION) || 3600;

  const timeLeft = Math.max(duration - (now - team.start_time), 0);

  res.render("participant/dashboard", {
    team,
    timeLeft
  });

});
// ================== BRIEFING PAGE ==================

app.get("/briefing", (req, res) => {

  if (!req.session.teamId) return res.redirect("/");

  res.render("participant/briefing");

});
// ================== LEVEL PAGE ==================

app.get("/level/:levelNumber", (req, res) => {

if (!req.session.teamId) return res.redirect("/");

const requestedLevel = parseInt(req.params.levelNumber);

const team = db.prepare(
"SELECT * FROM teams WHERE id = ?"
).get(req.session.teamId);

if (!team) return res.redirect("/");

const currentLevel = team.current_level;


// Prevent accessing previous or future levels
if (requestedLevel !== currentLevel) {
return res.redirect(`/level/${currentLevel}`);
}


// Prevent access after completion
if(team.status === "completed"){
return res.redirect("/escape");
}


// TIMER

const now = Math.floor(Date.now() / 1000);
const duration = parseInt(process.env.EVENT_DURATION) || 3600;

const timeLeft = Math.max(
duration - (now - team.start_time),
0
);

if(timeLeft <= 0){
return res.send("Time expired.");
}


// TABLE SELECTION

let tableName;

if(currentLevel === 1) tableName = "users";
if(currentLevel === 2) tableName = "orders";
if(currentLevel === 3) tableName = "payments";
if(currentLevel === 4) tableName = "activity_logs";


const rows = db.prepare(
`SELECT * FROM ${tableName} LIMIT 50`
).all();


res.render("participant/level", {
level: currentLevel,
tableName,
rows,
timeLeft
});

});
  // ================= LEVEL COMPLETE PAGE =================

app.get("/level-complete/:level", (req, res) => {

  if (!req.session.teamId) return res.redirect("/");

  const level = parseInt(req.params.level);

  const team = db.prepare(
    "SELECT * FROM teams WHERE id = ?"
  ).get(req.session.teamId);

  if (!team) return res.redirect("/");

  // Update level progress
  if (team.current_level === level && level < 4) {

    db.prepare(`
      UPDATE teams
      SET current_level = current_level + 1
      WHERE id = ?
    `).run(team.id);

  }

  res.render("participant/levelComplete", { level });

});

// ================== SUBMIT ANSWER ==================
app.post("/submit-answer",(req,res)=>{

if(!req.session.teamId) return res.redirect("/");

const { level, answer } = req.body;

const team = db.prepare(
"SELECT * FROM teams WHERE id = ?"
).get(req.session.teamId);

if(!team) return res.redirect("/");

const correctAnswer = LEVEL_ANSWERS[level];

if(parseInt(answer) !== correctAnswer){
return res.send("incorrect");
}

// If level 4 completed → final page
if(parseInt(level) === 4){
return res.send("correct");
}

// Update level
db.prepare(`
UPDATE teams
SET current_level = current_level + 1
WHERE id = ?
`).run(team.id);

res.send("correct");

});

// ================== FINAL PAGE ==================

app.get("/final", (req, res) => {

  if (!req.session.teamId) return res.redirect("/");

  const team = db.prepare(
    "SELECT * FROM teams WHERE id = ?"
  ).get(req.session.teamId);

  if (!team) return res.redirect("/");

  if (team.current_level !== 4) {
    return res.redirect(`/level/${team.current_level}`);
  }

  res.render("participant/final");

});
// ================== FINAL SUBMIT ==================

app.post("/final-submit", (req, res) => {
  if (!req.session.teamId) return res.redirect("/");

  const { passcode } = req.body;

  const team = db.prepare("SELECT * FROM teams WHERE id = ?")
                 .get(req.session.teamId);

  if (!team) return res.redirect("/");

  if (parseInt(passcode) === FINAL_PASSCODE) {

    const finishTime = Math.floor(Date.now() / 1000);
    const totalTimeTaken = finishTime - team.start_time;

    db.prepare(`
      UPDATE teams
      SET status = 'completed',
          finish_time = ?,
          total_time_taken = ?
      WHERE id = ?
    `).run(finishTime, totalTimeTaken, team.id);

    return res.render("participant/success");
  }

  res.send("Incorrect final passcode.");
});
app.get("/escape",(req,res)=>{

res.render("participant/success");

});

// ================== ADMIN ==================
app.get("/admin-reset", (req,res)=>{

if(!req.session.isAdmin){
return res.redirect("/admin-login");
}

db.prepare("DELETE FROM teams").run();

res.send("All teams cleared.");

});
app.get("/admin-login", (req, res) => {
  res.render("admin/login");
});

app.post("/admin-login", (req, res) => {
  const { password } = req.body;

  if (password === "SQLize@march5") {
    req.session.isAdmin = true;
    return res.redirect("/admin");
  }

  res.send("Wrong admin password.");
});

app.get("/admin",(req,res)=>{

if(!req.session.isAdmin){
return res.redirect("/admin-login");
}

const teams = db.prepare(`
SELECT 
team_name,
member1,
member2,
email,
current_level,
status,
start_time,
finish_time,
total_time_taken
FROM teams
ORDER BY
status DESC,
total_time_taken ASC,
current_level DESC
`).all();

res.render("admin/dashboard",{teams});

});

// ================== DATASET VIEWER ==================

app.get("/dataset/:level",(req,res)=>{

const level = parseInt(req.params.level);

let tableName;

if(level === 1) tableName = "users";
if(level === 2) tableName = "orders";
if(level === 3) tableName = "payments";
if(level === 4) tableName = "activity_logs";

const rows = db.prepare(`SELECT * FROM ${tableName}`).all();

res.render("participant/dataset",{
level,
tableName,
rows
});

});
// ================== SQL SANDBOX ==================

app.post("/test-query", (req, res) => {
  const { query } = req.body;

  const result = executeQuery(query);

  if (result.error) {
    return res.json({ success: false, error: result.error });
  }

  res.json({ success: true, data: result.results });
});

// ================== START SERVER ==================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});