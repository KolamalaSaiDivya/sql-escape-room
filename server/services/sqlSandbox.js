const { db } = require("../database/init");

function validateQuery(query) {
  const forbiddenKeywords = [
"DROP",
"DELETE",
"UPDATE",
"INSERT",
"ALTER",
"PRAGMA",
"ATTACH",
"DETACH",
"TRUNCATE",
"SQLITE_MASTER",
"INFORMATION_SCHEMA"
];

  const upperQuery = query.toUpperCase();

  if (!upperQuery.startsWith("SELECT")) {
    return { valid: false, message: "Only SELECT queries are allowed." };
  }

  for (let keyword of forbiddenKeywords) {
    if (upperQuery.includes(keyword)) {
      return { valid: false, message: `Keyword ${keyword} is not allowed.` };
    }
  }

  return { valid: true };
}

function executeQuery(query) {
  const validation = validateQuery(query);
if(!query.trim().toLowerCase().startsWith("select")){
return { error: "Only SELECT queries are allowed." };
}
  if (!validation.valid) {
    return { error: validation.message };
  }

  try {
    const stmt = db.prepare(query);
    const results = stmt.all();
    return { results };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { executeQuery };