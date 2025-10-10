// api.js

import { displayResults, displaySearchResults } from "./results.js";
import { buildRecordGraph, highlightAttributeNodeInMainGraph } from "./graph.js";

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
    displayResults(data);
  
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
      displayResults(data.rows);
    } else {
      displayResults([]); // show "No results" if rows missing
    } 
    
  } catch (err) {
    document.getElementById('results').innerHTML = `<p>Error: ${err.message}</p>`;
  }
}

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
      displayResults(data.rows);

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

