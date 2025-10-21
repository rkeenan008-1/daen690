// api.js

import { displayResults, displaySearchResults } from "/public/results.js";
import { buildRecordGraph, buildGraph } from "/public/graph.js";
import { buildSidebar, attachSidebarEvents } from "/public/sidebar.js";

// Fetch and build database schema on page load
export async function fetchAndBuildSchema() {
  try {
    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `SELECT
                  nsp.nspname AS owner,
                  rel.relname AS table_name,
                  att.attname AS column_name,
                  format_type(att.atttypid, att.atttypmod) AS data_type,
                  bool_or(con.contype = 'p') AS is_primary_key,
                  bool_or(con.contype = 'f') AS is_foreign_key,
                  MAX(nsp2.nspname) AS foreign_schema,
                  MAX(rel2.relname) AS foreign_table,
                  MAX(att2.attname) AS foreign_column,
                  MIN(att.attnum) AS column_order  -- keep column order for sorting
                FROM pg_attribute att
                JOIN pg_class rel
                  ON att.attrelid = rel.oid
                JOIN pg_namespace nsp
                  ON rel.relnamespace = nsp.oid
                LEFT JOIN pg_constraint con
                  ON att.attnum = ANY (con.conkey)
                  AND con.conrelid = rel.oid
                LEFT JOIN pg_class rel2
                  ON con.confrelid = rel2.oid
                LEFT JOIN pg_namespace nsp2
                  ON rel2.relnamespace = nsp2.oid
                LEFT JOIN pg_attribute att2
                  ON att2.attrelid = rel2.oid
                  AND att2.attnum = ANY (con.confkey)
                WHERE rel.relkind = 'r'
                  AND nsp.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND att.attnum > 0
                  AND NOT att.attisdropped
                GROUP BY
                  nsp.nspname, rel.relname, att.attname, att.atttypid, att.atttypmod
                ORDER BY
                  nsp.nspname, rel.relname, column_order;
                `,
      }),
    });

    const data = await res.json();

    if (Array.isArray(data) && data.length > 0) {
      const tables = buildGraph(data);
      buildSidebar(tables, data);
      attachSidebarEvents();
    } else {
      console.error("No schema data returned");
    }
  } catch (err) {
    console.error("Error fetching schema:", err);
  }
}

// Build graph from schema data
export async function submitQuery() {
  const query = document.getElementById('query').value;
  try {
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = await response.json();
    if (data.error) {
      document.getElementById('results').innerHTML = `<p>Error: ${data.error}</p>`;
      return;
    }
    displayResults(data, null); // no specific table
  
  } catch (err) {
    document.getElementById('results').innerHTML = `<p>Request failed: ${err.message}</p>`;
  }
}

// Search records by keyword
export async function searchRecords() {
  const keyword = document.getElementById('search-box').value.trim();
  if (!keyword) return;
  //console.log("Searching for:", keyword);
  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword }),
    });
    const data = await response.json();

    // ✅ Debug log
    console.log("Frontend received search results:", data);

    if (data.error) {
      document.getElementById('search-results').innerHTML = `<p>Error: ${data.error}</p>`;
      return;
    }

    // Display results in a list
    displaySearchResults(data.resultsWithMatches);
    
    // Build a filtered graph with only matching tables
    const tablesWithMatches = data.resultsWithMatches.map(r => r.table);

    // Flatten all rows and keep table info
    const allRows = data.resultsWithMatches.map(r => ({
      ...r.row,          // the row object itself
      __table: r.table,  // keep table name
      __matching_columns: r.matching_columns // optional: keep columns info
    }));

    //buildRecordGraph(allRows, "search", "record");

  } catch (err) {
    console.error("Search failed", err);
  }
}

// Fetch top N rows from a table
export async function fetchTopRows(table) {
  try {
    const response = await fetch(`/api/table/${table}/top`);
    if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error ${response.status}: ${text}`);
  }
    const data = await response.json();

    // Debug: see what comes from backend
    console.log("Backend response for top rows:", data);
    console.log("Backend response for top rows:", JSON.stringify(data, null, 2));

    // Populate query box
    if (data.query) {
      document.getElementById("query").value = data.query;
    }

    // Populate results
    if (data.rows && Array.isArray(data.rows)) {
      displayResults(data.rows, table);
    } else {
      displayResults([]); // show "No results" if rows missing
    } 
    
  } catch (err) {
    document.getElementById('results').innerHTML = `<p>Error: ${err.message}</p>`;
  }
}

// Fetch join records for a table
export async function fetchJoins(table) {
     
  try {
    const response = await fetch(`/api/table/${table}/joins`);
    //const response = await fetch(`/api/table/${table}/joins?type=${tableType}`);
    if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error ${response.status}: ${text}`);
  }
    const data = await response.json();

    // Debug: see what comes from backend
    console.log("Backend response for joins:", data);
    console.log("Backend response for join table:", JSON.stringify(data, null, 2));


    // Populate query box
    if (data.query) {
      document.getElementById("query").value = data.query;
    }

    // Populate results
    if (data.rows && Array.isArray(data.rows)) {
      displayResults(data.rows, table);

      // Use server-classified table type and table used
      const tableType = data.tableType || "node";  // fallback if server didn’t send it
      const tableUsed = data.tableUsed || table;

    // Build graph dataset
    buildRecordGraph(data.rows, tableUsed, tableType);

    } else {
      displayResults([]); // show "No results"
    } 
    
  } catch (err) {
    document.getElementById('results').innerHTML = `<p>Error: ${err.message}</p>`;
  }
    
}

// Fetch flow data for a specific node_id and build its flow graph
export async function loadFlowForNode(nodeId) {
  try {
    const res = await fetch(`/api/flow/${nodeId}`);
    if (!res.ok) throw new Error(`Failed to fetch flow for node ${nodeId}`);
    const data = await res.json();

    // Debug: see what comes from backend
    console.log("Backend response for flow data:", data);
    console.log("Backend response for flow data:", JSON.stringify(data, null, 2));

    if (!data || data.length === 0) {
      alert(`No flow found for node_id ${nodeId}`);
      return;
    }

    // Show in Record Graph box
    //buildFlowGraph(data.edges, nodeId);
    return data.edges

  } catch (err) {
    console.error(err);
    alert("Error loading flow graph: " + err.message);
  }
  
  
}