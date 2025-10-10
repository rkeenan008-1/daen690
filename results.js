// results.js
import { highlightAttributeNodeInMainGraph } from "./graph.js";


export function displayResults(data) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  if (!Array.isArray(data)) {
    if (data && data.rows && Array.isArray(data.rows)) {
      data = data.rows;
    } else {
      resultsDiv.textContent = "No results found or invalid data.";
      return;
    }
  }

  if (data.length === 0) {
    resultsDiv.textContent = "No results found.";
    return;
  }

  // --- Create table ---
  const table = document.createElement("table");
  table.classList.add("query-results-table");
  table.id = "query-results-table";

  // --- Header ---
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  Object.keys(data[0]).forEach(col => {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // --- Body ---
  const tbody = document.createElement("tbody");
  data.forEach(row => {
    const tr = document.createElement("tr");
    Object.values(row).forEach(val => {
      const td = document.createElement("td");
      td.textContent = val === null ? "NULL" : val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  // --- Wrap in scrollable div ---
  const wrapper = document.createElement("div");
  wrapper.classList.add("table-wrapper");
  wrapper.appendChild(table);
  resultsDiv.appendChild(wrapper);

  // --- Initialize DataTable ---
  $(document).ready(function () {
    if ($.fn.dataTable.isDataTable('#query-results-table')) {
      $('#query-results-table').DataTable().destroy();
    }

    $('#query-results-table').DataTable({
      paging: true,
      searching: true,
      ordering: true,
      scrollX: false,
      scrollY: '140px',
      fixedHeader: true
    });
  });
}


// Convert data to CSV and trigger download
function downloadCSV(data) {
  const keys = Object.keys(data[0]);
  const csvRows = [
    keys.join(','), // header
    ...data.map(row => keys.map(k => row[k]).join(','))
  ];
  const csvData = csvRows.join('\n');

  // trigger download
  const blob = new Blob([csvData], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', 'results.csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Display search results in a table with clickable columns
export function displaySearchResults(resultsWithMatches) {
  const resultsDiv = document.getElementById("search-results");
  resultsDiv.innerHTML = "";

  if (!resultsWithMatches || resultsWithMatches.length === 0) {
    resultsDiv.innerHTML = "<p>No matches found.</p>";
    return;
  }

  // Create table
  const table = document.createElement("table");
  table.classList.add("search-results-table");
  table.id = "search-results-table";

  // Add header row
  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Table</th>
      <th>Row</th>
      <th>Matched Columns & Values</th>
    </tr>
  `;
  table.appendChild(thead);

  // Add body
  const tbody = document.createElement("tbody");

  resultsWithMatches.forEach(r => {
    const tr = document.createElement("tr");

    // Table name
    const tableCell = document.createElement("td");
    tableCell.textContent = r.table;
    tr.appendChild(tableCell);

    // Row id string from backend
    const rowCell = document.createElement("td");
    rowCell.textContent = r.row_id;
    tr.appendChild(rowCell);

    // Matched columns with values (clickable)
    const colsCell = document.createElement("td");

    // Loop through each matched column
    r.matching_columns.forEach(colName => {
      const val = r.row[colName] ?? "(null)";

      // --- Normalize nodeId for Cytoscape graph ---
      let nodeId = `${r.table}.${colName}`; // default
      const parts = nodeId.split('.');
      if (parts.length === 3) {
          // e.g., public.attribute.attribute_name -> attribute.attribute_name
          nodeId = parts[1] + '.' + parts[2];
      }

      console.log("Normalized nodeId:", nodeId);

      // Create clickable span
      const span = document.createElement("span");
      span.textContent = `${colName}: ${val}`;
      span.classList.add("clickable-column");

      // Attach click handler for attribute graph
      span.addEventListener("click", () => {
      console.log(`Clicked on ${r.table}.${colName} (row ${r.row_id}) in search results`);

      // Highlight node in main schema graph
      highlightAttributeNodeInMainGraph(nodeId);

      // Optionally, still build the detailed attribute graph if you want
      // buildAttributeGraph(r.table, colName);
      });
      
      
      // Add line break between multiple columns
      colsCell.appendChild(span);
      colsCell.appendChild(document.createElement("br"));
    });

    tr.appendChild(colsCell);


    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  resultsDiv.appendChild(table);

  // Attach click handlers to matched columns
  resultsDiv.querySelectorAll(".matched-col").forEach(el => {
    el.addEventListener("click", () => {
      const table = el.dataset.table;
      const rowId = el.dataset.rowid;
      const col = el.dataset.col;

      console.log(`Clicked ${table}.${col} (row ${rowId})`);

      // Call your graph function (customize as needed)
      //buildRecordGraph([{ __table: table, __rowid: rowId }], "search", "record");
    });
  });

  // --- Wrap in scrollable div ---
  const wrapper = document.createElement("div");
  wrapper.classList.add("table-wrapper");
  wrapper.appendChild(table);
  resultsDiv.appendChild(wrapper);

  // --- Initialize DataTable ---
  $(document).ready(function () {
    if ($.fn.dataTable.isDataTable('#search-results-table')) {
      $('#search-results-table').DataTable().destroy();
    }

    $('#search-results-table').DataTable({
      paging: true,
      searching: true,
      ordering: true,
      scrollX: true,
      scrollY: '140px',
      fixedHeader: true
    });
  });
}
