// server.js (ESM style)

import express from "express";
import pkg from "pg";
import path from "path";
import bodyParser from "body-parser";
import format from "pg-format";
import { fileURLToPath } from "url";

const { Pool } = pkg;
const app = express();
const port = 3000;
app.use(bodyParser.json());

// Needed because __dirname doesn’t exist in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware to parse JSON request bodies
app.use(express.json());

// Middleware to parse URL-encoded request bodies
app.use(express.static(__dirname, {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript');
    }
  }
}));

// PostgreSQL connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'LookingGlassMetadata_8Sep2025',
  password: 'Pay041808+-26', // Change to new password
  port: 5432,
});

// API endpoint to handle SQL queries
app.post('/api/query', async (req, res) => {
  const { query } = req.body;
  try {
  // Validate query (basic example, add stricter validation in production)
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Invalid query' });
  }
  // Execute query
  const result = await pool.query(query);
    // res.json({ results: result.rows });
  res.json(result.rows); // send array directly
  } catch (err) {
  res.status(500).json({ error: 'Query failed', details: err.message });
  }
});

// Serve index.html for the root URL
app.get('/', (req, res) => {
 //res.sendFile(path.join(__dirname, 'public', 'index.html'));
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Table metadata (schema, columns, keys)
app.get("/api/table/:name", async (req, res) => {
  const tableName = req.params.name;

  try {
    const result = await pool.query(`
      SELECT 
        c.table_name, 
        c.column_name, 
        c.data_type,
        (SELECT COUNT(*) 
         FROM information_schema.table_constraints tc 
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND kcu.column_name = c.column_name
           AND kcu.table_name = c.table_name) > 0 AS is_primary_key,
        (SELECT COUNT(*) 
         FROM information_schema.key_column_usage kcu
         WHERE kcu.column_name = c.column_name
           AND kcu.table_name = c.table_name
           AND kcu.position_in_unique_constraint IS NOT NULL) > 0 AS is_foreign_key,
        kcu2.table_name AS foreign_table,
        kcu2.column_name AS foreign_column,
        c.table_schema AS owner
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu
        ON c.column_name = kcu.column_name
       AND c.table_name = kcu.table_name
      LEFT JOIN information_schema.constraint_column_usage kcu2
        ON kcu.position_in_unique_constraint IS NOT NULL
       AND kcu.constraint_name = kcu2.constraint_name
      WHERE c.table_name = $1
      ORDER BY c.column_name;
    `, [tableName]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch table details" });
  }
});

// Top ten rows from the table
app.get("/api/table/:name/top", async (req, res) => {
  const tableName = req.params.name;
  
  try {
    // Build query dynamically
    const query = `SELECT * FROM ${tableName}`;

    // Execute query
    const result = await pool.query(query); // assuming pg or similar
    const rows = result.rows; // PostgreSQL returns { rows: [...] }

    // Send back both query and rows
    res.json({
      query,   // the SQL string
      rows     // the actual data
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/table/:name/joins", async (req, res) => {
  const tableName = req.params.name;

  try {
    // 1) Get foreign-key info (parameterized)
    const fkInfoSql = `
      SELECT
        rc.constraint_name              AS fk_constraint,
        fk.table_schema                 AS fk_schema,
        fk.table_name                   AS fk_table,
        fk.column_name                  AS fk_column,
        fk.ordinal_position             AS fk_ordinal_position,
        pk.table_schema                 AS pk_schema,
        pk.table_name                   AS pk_table,
        pk.column_name                  AS pk_column
      FROM information_schema.referential_constraints rc
      JOIN information_schema.table_constraints tc
        ON rc.constraint_name = tc.constraint_name
        AND rc.constraint_schema = tc.constraint_schema
        AND tc.constraint_type = 'FOREIGN KEY'
      JOIN information_schema.key_column_usage fk
        ON fk.constraint_name = rc.constraint_name
        AND fk.constraint_schema = rc.constraint_schema
      JOIN information_schema.key_column_usage pk
        ON pk.constraint_name = rc.unique_constraint_name
        AND pk.constraint_schema = rc.unique_constraint_schema
        AND fk.position_in_unique_constraint = pk.ordinal_position
      WHERE fk.table_name = $1
      ORDER BY fk.constraint_name, fk.ordinal_position;
    `;
    const fkResult = await pool.query(fkInfoSql, [tableName]);

    if (fkResult.rowCount === 0) {
      return res.json({
        message: "No foreign keys to join on",
        tableType: "node",
        tableUsed: tableName,
      });
    }

    // 2) Build the generic joined SQL using pg-format to escape identifiers
    const tableIdent = format("%I", tableName);
    const joinClauses = fkResult.rows
      .map((fk, idx) => {
        // fk.fk_column and fk.pk_column are column names returned above
        const pkTableIdent = format("%I", fk.pk_table);
        const fkColIdent = format("%I", fk.fk_column);
        const pkColIdent = format("%I", fk.pk_column);
        return `LEFT JOIN ${pkTableIdent} f${idx} ON t.${fkColIdent} = f${idx}.${pkColIdent}`;
      })
      .join("\n");

    const selectFkParts = fkResult.rows.map((_, idx) => `f${idx}.*`).join(", ");
    const genericSQL = `
      SELECT t.*, ${selectFkParts}
      FROM ${tableIdent} t
      ${joinClauses}
    `;

    // 3) Execute the generic join (no $1 placeholders left)
    const genericResult = await pool.query(genericSQL);

    let finalRows = genericResult.rows;
    let queryUsed = genericSQL;
    let tableType = "node";

    // 4) Inspect returned column names to detect flow-type
    const colNames = genericResult.fields.map((f) => f.name);
    if (colNames.includes("source_id") && colNames.includes("destination_id")) {
      // Wrap genericSQL as subquery and join node table to get node types
      const flowSQL = `
        SELECT t.*, src.node_type AS source_node_type, dst.node_type AS dest_node_type
        FROM (${genericSQL}) t
        LEFT JOIN node src ON t.source_id = src.node_id
        LEFT JOIN node dst ON t.destination_id = dst.node_id
      `;
      const flowResult = await pool.query(flowSQL);
      finalRows = flowResult.rows;
      queryUsed = flowSQL;
      tableType = "flow";
    }

    // 5) Return the results to frontend
    res.json({
      query: queryUsed,
      rows: finalRows,
      tableType,
      tableUsed: tableName,
    });
  } catch (err) {
    console.error("Error in /api/table/:name/joins:", err);
    res.status(500).json({ error: err.message });
  }
});

// Utility: get all tables in the database (excluding system schemas)
async function getTables(client) {
  const sql = `
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name;
  `;
  const result = await client.query(sql);
  return result.rows; // array of { table_schema, table_name }
}

// Utility: search across all tables & text columns
async function searchTables(keyword) {
  const client = await pool.connect();
  try {
    const tables = await getTables(client);
    const results = [];

    for (const { table_schema, table_name } of tables) {
      // Quote identifiers
      const fullTable = format("%I.%I", table_schema, table_name);

      // Get column names
      const colsRes = await client.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_schema = $1 AND table_name = $2`,
        [table_schema, table_name]
      );

      const colNames = colsRes.rows.map(r => r.column_name);
      if (colNames.length === 0) continue; // Skip empty tables

      // Get PK columns for this table
      const pkColsRes = await client.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
      `, [table_schema, table_name]);

      const pkCols = pkColsRes.rows.map(r => r.column_name);
      
      // Build LIKE clauses
      const likeClauses = colNames.map(c => format("%I::text ILIKE $1", c)).join(" OR ");

      const sql = `
        SELECT *, ctid AS row_id
        FROM ${fullTable}
        WHERE ${likeClauses}
        LIMIT 100
      `;

      // Debug log
      //console.log("Searching table:", fullTable);
      //console.log("SQL:", sql);

      const rows = await client.query(sql, [`%${keyword}%`]);
      if (rows.rows.length > 0) {
        results.push({ table: `${table_schema}.${table_name}`, rows: rows.rows, colNames, pkCols } );
      }
    }

    return results;
  } finally {
    client.release();
  }
}



// Search endpoint for records by keyword
app.post("/api/search", async (req, res) => {
  const { keyword } = req.body;
  if (!keyword) {
    return res.status(400).json({ error: "Keyword is required" });
  }

  try {
    const results = await searchTables(keyword);
    const dedupedMap = new Map();

    results.forEach(tableObj => {
      const { table, rows, colNames, pkCols } = tableObj;

      rows.forEach(row => {
        const matchingColumns = colNames.filter(
          col => row[col] && row[col].toString().toLowerCase().includes(keyword.toLowerCase())
        );

        if (matchingColumns.length > 0) {
          // Build a stable row key from PK values (or fallback to ctid if no PK exists)
          let pkValue;
          if (pkCols.length > 0) {
            pkValue = pkCols.map(col => `${col}=${row[col]}`).join(",");
          } else {
            pkValue = `ctid=${row.row_id}`; // fallback
          }

          // Build reduced row: only PK + matched cols
          const reducedRow = {};
          pkCols.forEach(col => { reducedRow[col] = row[col]; });
          matchingColumns.forEach(col => { reducedRow[col] = row[col]; });

          const key = `${table}-${pkValue}`;
          if (!dedupedMap.has(key)) {
            dedupedMap.set(key, {
              table,
              row_id: pkValue,
              row: reducedRow,
              matching_columns: matchingColumns
            });
          } else {
            const existing = dedupedMap.get(key);
            existing.matching_columns.push(...matchingColumns);
            existing.matching_columns = [...new Set(existing.matching_columns)];
          }
        }
      });


    });

    const resultsWithMatches = Array.from(dedupedMap.values()).map(r => ({
      table: r.table,
      row_id: r.row_id,
      row: r.row,
      matching_columns: Array.from(r.matching_columns),
    }));
    
    res.json({ resultsWithMatches });
    //res.json({ resultsWithMatches: Array.from(dedupedMap.values()) });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({
      error: "Server error during search",
      details: err.message,
      stack: err.stack
    });
  }
});



// Start server
app.listen(port, () => {
 console.log(`Server running at http://localhost:${port}`);
});