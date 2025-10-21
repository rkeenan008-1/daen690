// results.js
import { highlightAttributeNodeInMainGraph, traceColumnLineage, buildFlowGraph, schemaData, buildRecordGraphFromValue } from "/public/graph.js";
import { loadFlowForNode } from "/public/api.js"; 


export function displayResults(data, tableName) {
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
    Object.entries(row).forEach(([col, val]) => {
      const td = document.createElement("td");
      const valueText = val === null ? "NULL" : val;

      // ✅ Check if PK/FK column first
      const pkFkCols = getPkFkColumns(tableName || "");

      if (pkFkCols.has(col) && val !== null && col !== "node_id") {
        // Make PK/FK value clickable
        const span = document.createElement("span");
        span.textContent = valueText;
        span.classList.add("clickable-pkfk");
        span.dataset.table = row.table_name || tableName;
        span.dataset.column = col;
        span.dataset.value = val;

        span.addEventListener("click", async () => {
          console.log(`🟢 PK/FK clicked: ${span.dataset.table}.${col} = ${val}`);
          await buildRecordGraphFromValue(span.dataset.table, col, val);
        });

        td.appendChild(span);
      }

      // ✅ Handle node_id column
      else if (pkFkCols.has(col) && val !== null && col === "node_id") {
        const span = document.createElement("span");
        span.textContent = valueText;
        span.classList.add("clickable-node-id");
        span.dataset.nodeId = val;

        span.addEventListener("click", async () => {
          console.log("Clicked node_id in query result:", val);
          try {
            const edges = await loadFlowForNode(val);
            if (edges?.length > 0) buildFlowGraph(edges, val);
            else alert("No flows found for this node.");
          } catch (err) {
            console.error("Error loading flow graph:", err);
          }
        });

        td.appendChild(span);
      }

      // ✅ Default non-clickable cell
      else {
        td.textContent = valueText;
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);

  resultsDiv.appendChild(table);

  // --- Initialize DataTable ---
  $(document).ready(function () {
    if ($.fn.dataTable.isDataTable('#query-results-table')) {
      $('#query-results-table').DataTable().destroy();
    }

    $('#query-results-table').DataTable({
      paging: true,
      searching: true,
      ordering: true,
      scrollX: true,         // ✅ enable horizontal scroll
      scrollY: '140px',      // ✅ allow vertical scroll
      fixedHeader: true,
      autoWidth: false       // ✅ prevents weird header misalignments
    });

    // Force column width alignment
    $('.dataTables_scrollHeadInner, .dataTables_scrollBody table').css('width', '100%');
    $('.dataTables_scrollHeadInner table').css('width', '100%');
    
  });


  $(window).on('resize', function() {
    $('#query-results-table').DataTable().columns.adjust().draw(false);
  });
}

// Helper: returns a Set of PK/FK columns for the given table
export function getPkFkColumns(tableName) {
  return new Set(
    schemaData
      .filter(r => r.table_name === tableName && (r.is_primary_key || r.is_foreign_key))
      .map(r => r.column_name)
  );
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
      //highlightAttributeNodeInMainGraph(nodeId);

      // Column-level lineage
      traceColumnLineage(parts[1], r.row_id, r.matching_columns);

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

  // --- Initialize DataTable ---
  $(document).ready(function () {
    if ($.fn.dataTable.isDataTable('#search-results-table')) {
      $('#search-results-table').DataTable().destroy();
    }

    $('#search-results-table').DataTable({
      paging: true,
      searching: true,
      ordering: true,
      scrollX: true,         // ✅ enable horizontal scroll
      scrollY: '140px',      // ✅ allow vertical scroll
      fixedHeader: true,
      autoWidth: false       // ✅ prevents weird header misalignments
    });

    // Force column width alignment
    $('.dataTables_scrollHeadInner, .dataTables_scrollBody table').css('width', '100%');
    $('.dataTables_scrollHeadInner table').css('width', '100%');
    
  });

  $(window).on('resize', function() {
    $('#search-results-table').DataTable().columns.adjust().draw(false);
  });
}

// Generate a report of the current flow graph
export function generateFlowReport() {
  if (!window.cyFlow) {
    alert("No flow graph available.");
    return;
  }

  const cyFlow = window.cyFlow;

  // Get visible nodes and edges
  const visibleNodes = cyFlow.nodes(':visible');
  const visibleEdges = cyFlow.edges(':visible');

  // Collect node info
  const nodesReport = visibleNodes.map(n => ({
    id: n.data('id'),
    label: n.data('label'),
    type: n.data('type')
  }));

  // Collect edge info
  const edgesReport = visibleEdges.map(e => ({
    id: e.data('id'),
    label: e.data('label'),
    source: e.data('source'),
    target: e.data('target'),
    method: e.data('method'),
    bandwidth: e.data('bandwidth'),
    encrypted: e.data('encrypted'),
    description: e.data('description')
  }));

  const report = {
    timestamp: new Date().toLocaleString(),
    nodeCount: nodesReport.length,
    edgeCount: edgesReport.length,
    nodes: nodesReport,
    edges: edgesReport
  };

  // Remove existing popup
  const existingPopup = document.getElementById("flow-summary-popup");
  if (existingPopup) existingPopup.remove();

  // --- Popup container ---
  const popup = document.createElement("div");
  popup.id = "flow-summary-popup";
  Object.assign(popup.style, {
    position: "fixed",
    top: "100px",
    left: "100px",
    width: "450px",
    height: "500px",
    background: "#fff",
    border: "2px solid #0078D7",
    borderRadius: "10px",
    boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    resize: "both",
    overflow: "auto"
  });

  // --- Header ---
  const header = document.createElement("div");
  Object.assign(header.style, {
    background: "#0078D7",
    color: "#fff",
    padding: "8px 10px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "move",
    borderTopLeftRadius: "8px",
    borderTopRightRadius: "8px"
  });
  header.innerHTML = `
  <span><strong>Flow Graph Report</strong></span>
  <div style="display:flex;gap:5px;">
    <button id="save-flow-summary" style="background:#28a745;color:#fff;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;">💾 Save</button>
    <button id="close-flow-summary" style="background:#e74c3c;color:#fff;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;">X</button>
  </div>
`;

  popup.appendChild(header);

  // --- Content area ---
  const content = document.createElement("div");
  Object.assign(content.style, {
    padding: "10px",
    overflowY: "auto",
    flex: "1"
  });

  content.innerHTML = `
    <p><strong>Generated:</strong> ${report.timestamp}</p>
    <p><strong>Nodes:</strong> ${report.nodeCount}</p>
    <p><strong>Edges:</strong> ${report.edgeCount}</p>

    <h4>Node Details</h4>
    <ul>${report.nodes
      .map(
        n => `<li><strong>${n.label}</strong> (${n.type || "Unknown"}) — ID: ${n.id}</li>`
      )
      .join("")}</ul>

    <h4>Edge Details</h4>
    <ul>${report.edges
      .map(
        e => `<li>${e.source} → ${e.target} (${e.label || "no label"}) 
        <br><small>Method: ${e.method || "n/a"}, Bandwidth: ${
          e.bandwidth || "n/a"
        }, Encrypted: ${e.encrypted || "n/a"}</small></li>`
      )
      .join("")}</ul>
  `;
  popup.appendChild(content);

  // Add popup to document
  document.body.appendChild(popup);

  // --- Close button behavior ---
  document.getElementById("close-flow-summary").addEventListener("click", () => popup.remove());

  // --- Save popup as HTML file ---
  document.getElementById("save-flow-summary").addEventListener("click", () => {
    const htmlContent = `
      <html><head><meta charset="UTF-8"><title>Flow Graph Report</title></head>
      <body>${popup.outerHTML}</body></html>
    `;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flow-report-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  });


  // --- Make popup draggable ---
  makeDraggable(popup, header);
}

// ✅ Helper: Draggable logic
function makeDraggable(popup, handle) {
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  handle.addEventListener("mousedown", e => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(window.getComputedStyle(popup).left, 10);
    startTop = parseInt(window.getComputedStyle(popup).top, 10);
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", e => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    popup.style.left = `${startLeft + dx}px`;
    popup.style.top = `${startTop + dy}px`;
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    document.body.style.userSelect = "auto";
  });
}



