

// query submission
async function submitQuery() {
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

// fetch top rows for a table
async function fetchTopRows(table) {
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

//
async function fetchJoins(table) {
  
  try {
    const response = await fetch(`/api/table/${table}/joins`);
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


function displayResults(data) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  // Normalize data: must be an array
  if (!Array.isArray(data)) {
    if (data && data.rows && Array.isArray(data.rows)) {
      data = data.rows;   // PostgreSQL/pg often wraps results in { rows: [...] }
    } else {
      resultsDiv.textContent = "No results found or invalid data.";
      return;
    }
  }

  if (data.length === 0) {
    resultsDiv.textContent = "No results found.";
    return;
  }

  const table = document.createElement("table");

  // Header
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  Object.keys(data[0]).forEach(col => {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
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


  // Create a download button
  const btn = document.createElement("button");
  btn.textContent = "Download CSV";
  btn.style.marginTop = "10px";
  btn.onclick = () => downloadCSV(data);  
  resultsDiv.appendChild(btn);

  resultsDiv.appendChild(table);
}


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


// ----------------------
// Tooltip Formatting
// ----------------------

function formatTooltip(data) {
  if (data.type === "table") {
    const columns = data.columns || [];

    // Collect PKs and FKs without duplicates
    const pkSet = new Set();
    const fkSet = new Set();

    columns.forEach((col) => {
      if (col.is_pk || col.is_primary_key) {
        pkSet.add(col.column_name);
      }
      if (col.is_fk || col.is_foreign_key) {
        fkSet.add(`${col.column_name} → ${col.foreign_table}.${col.foreign_column}`);
      }
    });

    const pkText = pkSet.size > 0 ? [...pkSet].join(", ") : "None";
    const fkText = fkSet.size > 0 ? [...fkSet].join(", ") : "None";

    return `Schema: ${data.owner || "unknown"}\nTable: ${data.id}\nPKs: ${pkText}\nFKs: ${fkText}`;
  }

  if (data.type === "column") {
    let label = data.label || data.column_name;

    // Add PK / FK tags
    if (data.is_pk) {
      label += " [PK]";
    }
    if (data.is_fk && data.foreign_table && data.foreign_column) {
      label += ` [FK → ${data.foreign_table}.${data.foreign_column}]`;
    } else if (data.is_fk) {
      label += " [FK]";
    }

    return `Column: ${label}<br>Table: ${data.table}`;
  }

  return "";
}

// ----------------------
// Tooltip Attachment
// ----------------------
function attachTooltip(cyInstance) {
  const tooltip = document.createElement("div");
  tooltip.style.position = "absolute";
  tooltip.style.background = "rgba(0,0,0,0.85)";
  tooltip.style.color = "#fff";
  tooltip.style.padding = "4px 6px";
  tooltip.style.borderRadius = "4px";
  tooltip.style.fontSize = "12px";
  tooltip.style.whiteSpace = "pre"; // preserve line breaks
  tooltip.style.display = "none";
  tooltip.style.pointerEvents = "none";
  document.body.appendChild(tooltip);

  cyInstance.on("mouseover", "node", (event) => {
    const node = event.target;
    node.addClass("highlight");
    //tooltip.textContent = formatTooltip(node.data());
    tooltip.innerHTML = formatTooltip(node.data());
    tooltip.style.display = "block";
    tooltip.style.left = event.originalEvent.pageX + 10 + "px";
    tooltip.style.top = event.originalEvent.pageY + 10 + "px";
  });

  cyInstance.on("mousemove", "node", (event) => {
    tooltip.style.left = event.originalEvent.pageX + 10 + "px";
    tooltip.style.top = event.originalEvent.pageY + 10 + "px";
  });

  cyInstance.on("mouseout", "node", (event) => {
    event.target.removeClass("highlight");
    tooltip.style.display = "none";
  });
}

// Build sidebar with tables and columns

function buildSidebar(tables, data) {
    const list = document.getElementById("entity-list");
    const searchInput = document.getElementById("search");

    function render(filteredTables) {
        list.innerHTML = "<ul class='sidebar-tables'>" + filteredTables
            .map(tbl => {
                const columns = [...new Map(
                    data
                        .filter(r => r.table_name === tbl && (r.column_name || ""))
                        .map(r => [r.column_name, { 
                            name: r.column_name, 
                            is_pk: r.is_primary_key, 
                            is_fk: r.is_foreign_key 
                        }])
                ).values()].sort((a, b) => a.name.localeCompare(b.name));

                const colsHtml = columns.length > 0
                    ? `<ul class="columns collapsed">` +
                      columns.map(c => {
                          let label = c.name;
                          if (c.is_pk) label += " [PK]";
                          if (c.is_fk) label += " [FK]";
                          return `<li data-table="${tbl}" data-column="${c.name}">${label}</li>`;
                      }).join('') +
                      `</ul>`
                    : "";

                return `<li class="table-item" data-entity="${tbl}">
                            <span class="table-label">▶ ${tbl}</span>
                            ${colsHtml}
                        </li>`;
            })
            .join("") + "</ul>";

        // Table expand/collapse
        list.querySelectorAll(".table-label").forEach(label => {
            label.addEventListener("click", e => {
                e.stopPropagation();
                const li = label.parentElement;
                const colsUl = li.querySelector(".columns");
                if (!colsUl) return;

                const isCollapsed = colsUl.classList.toggle("collapsed");
                label.textContent = (isCollapsed ? "▶ " : "▼ ") + li.dataset.entity;

                const node = cy.$id(li.dataset.entity);
                if (node) {
                    cy.nodes().removeClass("highlight-selected");
                    node.addClass("highlight-selected");
                    cy.center(node);
                    cy.fit(node, 200);
                }
            });
        });

        // Column click → highlight column node
        list.querySelectorAll("li[data-column]").forEach(li => {
            li.addEventListener("click", e => {
                e.stopPropagation();
                const table = li.dataset.table;
                const column = li.dataset.column;
                const nodeId = `${table}.${column}`;
                const node = cy.$id(nodeId);
                if (node) {
                    cy.nodes().removeClass("highlight-selected");
                    node.addClass("highlight-selected");
                    cy.center(node);
                    cy.fit(node, 200);
                }
            });
        });
    }

    // Filter function
    
    function filterTables() {
        const q = searchInput.value.toLowerCase();
        const filtered = tables.filter(t => {
            const tableMatch = t.toLowerCase().includes(q);
            const columnMatch = data.some(d => d.table_name === t && (d.column_name || "").toLowerCase().includes(q));
            return tableMatch || columnMatch;
        });

        render(filtered);

        // Highlight in Cytoscape
        if (cy) {
            cy.nodes().forEach(n => {
                const nodeLabel = (n.data("label") || "").toLowerCase();
                const nodeId = (n.data("id") || "").toLowerCase();
                if (q === "") {
                    n.removeClass("highlight-search");
                } else if (nodeLabel.includes(q) || nodeId.includes(q)) {
                    n.addClass("highlight-search");
                } else {
                    n.removeClass("highlight-search");
                }
            });
        }

        // Scroll to first matched table in sidebar
        if (filtered.length > 0) {
            const firstTableItem = list.querySelector(`li[data-entity="${filtered[0]}"]`);
            if (firstTableItem) {
                firstTableItem.scrollIntoView({ behavior: "smooth", block: "center" });
                // Optionally highlight first item visually
                firstTableItem.classList.add("highlight-search");
                setTimeout(() => firstTableItem.classList.remove("highlight-search"), 2000);
            }
        }
    }
    // Initial render
    render(tables);

    // --- Event listeners ---

    // Filter on Enter key
    searchInput.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.preventDefault();
            filterTables();
        }
    });

    // Optional: live filter while typing
    // searchInput.addEventListener("input", filterTables);
}


function attachSidebarEvents() {
  document.querySelectorAll("#entity-list li[data-entity]").forEach(li => {
    li.addEventListener("click", e => {
      e.stopPropagation();
      const table = li.dataset.entity;

      // --- MAIN GRAPH (cy) ---
      if (typeof cy !== "undefined" && cy && cy.$id(table).length) {
        cy.nodes().removeClass("highlight-selected");
        const mainNode = cy.$id(table);
        mainNode.addClass("highlight-selected");

        // focus view
        cy.center(mainNode);
        cy.fit(mainNode, 150);
      }

      // --- TABLE GRAPH (cyTable) ---
      if (typeof cyTable !== "undefined" && cyTable && cyTable.$id(table).length) {
        cyTable.nodes().removeClass("highlight-selected");
        const tableNode = cyTable.$id(table);
        tableNode.addClass("highlight-selected");

        // focus view
        cyTable.center(tableNode);
        cyTable.fit(tableNode, 150);
      }
    });
  });
}


let cy; // global Cytoscape instance
let cyTable; //table-specifc Cytoscape instance for specific table view

// Resize Cytoscape on window resize
window.addEventListener("resize", () => {
  if (cy) {
    cy.resize();
    cy.fit(cy.elements(), 50); // keep main graph inside
  }
  if (cyTable) {
    cyTable.resize();
    cyTable.fit(cyTable.elements(), 50);
  }
});

// Helper: disable browser context menu for any Cytoscape instance
function disableRightClick(cyInstance) {
    const container = cyInstance.container();

    // Prevent browser context menu anywhere in container
    container.addEventListener("contextmenu", e => e.preventDefault());

    // Prevent right-click on nodes and edges
    cyInstance.on("cxttap", "node, edge", evt => {
        evt.originalEvent.preventDefault();
        evt.originalEvent.stopPropagation(); // ensure it doesn’t bubble
    });

    // Prevent right-click on background (empty space)
    cyInstance.on("cxttap", evt => {
        if (evt.target === cyInstance) {
            evt.originalEvent.preventDefault();
            evt.originalEvent.stopPropagation();
        }
    });
}


let schemaData = []; // Store full schema data globally
function buildGraph(data) {
    let elements = [];
    let nodeSet = new Set();
    let edgeSet = new Set();
    schemaData = data; // Store globally for sidebar use

    // Table nodes
    let tables = [...new Set(data.map(row => row.table_name).filter(t => t))]; // filter undefined
    tables.forEach(t => {
        const tableColumns = data
            .filter(r => r.table_name === t)
            .map(r => ({
                table_name: r.table_name,
                column_name: r.column_name,
                data_type: r.data_type,
                is_pk: r.is_primary_key,
                is_fk: r.is_foreign_key,
                foreign_table: r.foreign_table,
                foreign_column: r.foreign_column,
                owner: r.owner
            }));

        if (!nodeSet.has(t)) {
            elements.push({
                data: { id: t, label: `Table: ${t}`, type: "table", columns: tableColumns, owner: tableColumns[0]?.owner || "unknown" }
            });
            nodeSet.add(t);
        }
    });

    // Column nodes + edges
    data.forEach(row => {
        if (!row.table_name || !row.column_name) {
            console.warn("Skipping row with missing table_name or column_name:", row);
            return;
        }

        const colId = `${row.table_name}.${row.column_name}`;

        if (!nodeSet.has(colId)) {
            elements.push({
                data: {
                    id: colId,
                    label: `${row.column_name} (${row.data_type || "unknown"})`,
                    table: row.table_name,
                    is_pk: row.is_primary_key || false,
                    is_fk: row.is_foreign_key || false,
                    foreign_table: row.foreign_table || null,
                    foreign_column: row.foreign_column || null,
                    type: "column",
                    owner: row.owner || "unknown"
                },
                classes: row.is_primary_key ? "pk" : (row.is_foreign_key ? "fk" : "column")
            });
            nodeSet.add(colId);
        }

        const tableEdgeId = `${row.table_name}->${colId}`;
        if (!edgeSet.has(tableEdgeId)) {
            elements.push({
                data: { id: tableEdgeId, source: row.table_name, target: colId, label: "has_column" }
            });
            edgeSet.add(tableEdgeId);
        }

        // Foreign key edges
        if (row.is_foreign_key && row.foreign_table && row.foreign_column) {
            const fkId = `${row.table_name}.${row.column_name}->${row.foreign_table}.${row.foreign_column}`;
            if (!edgeSet.has(fkId)) {
                elements.push({
                    data: {
                        id: fkId,
                        source: `${row.table_name}.${row.column_name}`,
                        target: `${row.foreign_table}.${row.foreign_column}`,
                        label: "foreign_key"
                    }
                });
                edgeSet.add(fkId);
            }
        }
    });

    //if (cy) cy.destroy();

    cy = cytoscape({
        container: document.getElementById("cy-main"),
        elements: elements,
        layout: { name: "cose" },
        style: [
            { selector: "node", style: { label: "data(label)", "font-size": "12px" } },
            { selector: "node[type='table']", style: { shape: "rectangle", "background-color": "#818b8a", "padding": "20px" } },
            { selector: ".column", style: { shape: "ellipse", "background-color": "#64B5F6" } },
            { selector: ".pk", style: { "background-color": "#388E3C", "border-width": 2, "border-color": "black" } },
            { selector: ".fk", style: { "background-color": "#FBC02D", "border-width": 2, "border-color": "black" } },
            { selector: "edge", style: { label: "data(label)", "curve-style": "bezier", "target-arrow-shape": "triangle" } },
            { selector: ".highlight", style: { "border-width": 3, "border-color": "#FFD700" } },

            // Highlight classes for Cytoscape
            { selector: ".highlight-hover", style: { "border-width": 3, "border-color": "#FFD700" } },
            { selector: ".highlight-search", style: { "border-width": 3, "border-color": "#FFD700", "background-color": "#FFF176" } },
            { selector: ".highlight-selected", style: { "border-width": 4, "border-color": "#4CAF50", "background-color": "#AED581" } }

        ]
    });

    disableRightClick(cy); // BLOCK RIGHT-CLICK HERE

    attachTooltip(cy);

    // Force resize + fit so graph doesn’t overflow
    setTimeout(() => {
      cy.resize();
      cy.fit(cy.elements(), 50); // 50px padding
    }, 100);

    // Left-click on a table node → open table graph view
    // Click on table node → build table graph 
    cy.on("tap", "node[type='table']", evt => { 
      const nodeData = evt.target.data(); 
      document.getElementById("node-info").textContent = JSON.stringify(nodeData, null, 2); 
      buildTableGraph(nodeData.id, nodeData.columns, true); 
    });

 
    // Right-click on table node → show context menu
    cy.on("cxttap", "node[type='table']", evt => {
      evt.originalEvent.preventDefault();  // stop browser context menu
      evt.originalEvent.stopPropagation();  // stop bubbling
      const table = evt.target.data("id");

      showMenu(evt.originalEvent.pageX, evt.originalEvent.pageY, [
        {
          label: "Show top 10 rows",
          action: () => fetchTopRows(table)
        },
        {
          label: "Generate SELECT with JOINs",
          action: () => fetchJoins(table)
        }
      ]);
    });

  return tables;  // Send back the list of table names
}

function buildTableGraph(tableName, details, addExternalNodes = true) {
    const container = document.getElementById("cy-table-container");
    container.innerHTML = "";

    cyTable = cytoscape({
        //container: container,
        container: document.getElementById("cy-table-container"),
        elements: [],
        style: [
            { selector: "node", style: { label: "data(label)", "font-size": "12px" } },
            { selector: "node[type='table']", style: { shape: "rectangle", "background-color": "#818b8a", "padding": "10px" } },
            { selector: ".column", style: { shape: "ellipse", "background-color": "#64B5F6" } },
            { selector: ".pk", style: { "background-color": "#388E3C", "border-width": 2, "border-color": "black" } },
            { selector: ".fk", style: { "background-color": "#FBC02D", "border-width": 2, "border-color": "black" } },
            { selector: "node.external", style: { "background-color": "#852670", shape: "rectangle" } },
            { selector: "node.expanded", style: { "background-color": "#818b8a", shape: "rectangle" } },
            { selector: "edge", style: { label: "data(label)", "curve-style": "bezier", "target-arrow-shape": "triangle" } },
            { selector: ".highlight", style: { "border-width": 3, "border-color": "#FFD700" } }
        ],
        layout: { name: "cose", fit: true }
    });

    disableRightClick(cyTable); // BLOCK RIGHT-CLICK

    attachTooltip(cyTable);

    // Add table node
    const tableOwner = details[0]?.owner || "unknown";
    cyTable.add({ 
        group: "nodes", 
        data: { 
            id: tableName, 
            label: `Table: ${tableName}`, 
            type: "table", 
            columns: details,
            owner: tableOwner   // <-- attach owner here
        } 
    });


    details.forEach(col => {
        if (!col.table_name || !col.column_name) return; // skip invalid

        const colId = `${col.table_name}.${col.column_name}`;

        if (cyTable.$id(colId).empty()) {          
            cyTable.add({
                group: "nodes",
                data: {
                    id: colId,
                    label: `${col.column_name} : ${col.data_type}`,
                    table: tableName,
                    type: "column",
                    is_pk: col.is_pk || col.is_primary_key || false,
                    is_fk: col.is_fk || col.is_foreign_key || false,
                    foreign_table: col.foreign_table || null,
                    foreign_column: col.foreign_column || null,
                    owner: col.owner || "unknown"
                },
                classes: (col.is_pk || col.is_primary_key) ? "pk" : (col.is_fk || col.is_foreign_key) ? "fk" : "column"
            });

        }

        // Edge from table → column
        const edgeId = `${tableName}->${colId}`;
        if (cyTable.$id(edgeId).empty()) {
            cyTable.add({ group: "edges", data: { id: edgeId, source: tableName, target: colId, label: "has_column" } });
        }

        // Foreign key edge
        if (col.is_fk && col.foreign_table && col.foreign_column) {
            
            const targetTableId = col.foreign_table;

            if (cyTable.$id(targetTableId).empty() && addExternalNodes) {
              const schemaRows = schemaData.filter(r => r.table_name === targetTableId);
              const tableOwner = schemaRows[0]?.owner || "unknown";
                cyTable.add({ 
                    group: "nodes", 
                    data: { id: targetTableId, label: `Table: ${targetTableId}`, type: "table", owner: tableOwner }, 
                    classes: "external" 
                });
            }

            const fkEdgeId = `${colId}->${targetTableId}`;
            if (cyTable.$id(fkEdgeId).empty()) {
                cyTable.add({ 
                    group: "edges", 
                    data: { id: fkEdgeId, source: colId, target: targetTableId, label: "foreign_key" } 
                });
            }

        }
    });

    cyTable.layout({ name: "cose", fit: true }).run();
    cyTable.nodes().forEach(node => node.grabify());

    cyTable.on("tap", "node", evt => {
        document.getElementById("node-info").textContent = JSON.stringify(evt.target.data(), null, 2);
    });
    
    
    cyTable.on("tap", "node.external", evt => {
    const node = evt.target;
    const tableId = node.id().split(".")[0]; // extract table name
    
    // get columns of this table from schemaData
    const details = schemaData.filter(r => r.table_name === tableId);

    if (details.length > 0) {
        // upgrade this external node to a full table node
        node.removeClass("external");
        node.data("type", "table");
        node.data("label", `Table: ${tableId}`);

        // now expand like a normal table
        expandTableInGraph(tableId, cyTable, details);
    }
    });


    
    // Right-click on table node → show context menu
    cyTable.on("cxttap", "node[type='table']", evt => {
      evt.originalEvent.preventDefault();  // stop browser context menu
      evt.originalEvent.stopPropagation();  // stop bubbling
      const table = evt.target.data("id");

      showMenu(evt.originalEvent.pageX, evt.originalEvent.pageY, [
        {
          label: "Show top 10 rows",
          action: () => fetchTopRows(table)
        },
        {
          label: "Generate SELECT with JOINs",
          action: () => fetchJoins(table)
        }
      ]);
    });
}

function expandTableInGraph(tableId, cyTable, details) {
  if (!details || details.length === 0) return;

  // Find the node in Cytoscape
  const node = cyTable.$id(tableId);
  if (!node.length) return;

  // Upgrade node to a table
  node.data("type", "table");
  node.data("label", `Table: ${tableId}`);
  node.data("columns", details);   // attach column metadata
  node.removeClass("external").addClass("expanded");

  // Add its column nodes
  details.forEach(col => {
    const colId = `${tableId}.${col.column_name}`;
    if (!cyTable.$id(colId).length) {
      cyTable.add({
        group: "nodes",
        data: {
          id: colId,
          label: `${col.column_name} : ${col.data_type}`,
          table: tableId,
          type: "column",
          is_pk: col.is_pk || col.is_primary_key || false,
          is_fk: col.is_fk || col.is_foreign_key || false,
          foreign_table: col.foreign_table,
          foreign_column: col.foreign_column,
          owner: col.owner || col.owner || "unknown"
        },
        classes: (col.is_pk || col.is_primary_key) ? "pk" : (col.is_fk || col.is_foreign_key) ? "fk" : "column"
      });

      // Edge from table → column
      cyTable.add({
        group: "edges",
        data: { id: `${tableId}->${colId}`, source: tableId, target: colId }
      });
    }

    // Handle FK relationships
    if (col.is_foreign_key && col.foreign_table) {
      const targetTableId = col.foreign_table;

      // Add external table node if not already present
      if (!cyTable.$id(targetTableId).length) {
        cyTable.add({
          group: "nodes",
          data: { id: targetTableId, label: `Table: ${targetTableId}`, type: "table" },
          classes: "external"
        });
      }

      // Edge from this column → external table
      cyTable.add({
        group: "edges",
        data: { id: `${colId}->${targetTableId}`, source: colId, target: targetTableId }
      });
    }
  });

  // Re-run layout for clarity
  cyTable.layout({ name: "cose", animate: true, fit: false }).run();
}

// Simple context menu implementation
function showMenu(x, y, options) {
    // remove existing menu
    let menu = document.getElementById("context-menu");
    if (menu) menu.remove();

    menu = document.createElement("div");
    menu.id = "context-menu";
    menu.style.position = "absolute";
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.style.background = "#fff";
    menu.style.border = "1px solid #ccc";
    menu.style.padding = "4px";
    menu.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    menu.style.zIndex = 1000;

    options.forEach(opt => {
        const item = document.createElement("div");
        item.textContent = opt.label;
        item.style.cursor = "pointer";
        item.style.padding = "2px 6px";
        item.addEventListener("click", () => {
            opt.action();
            menu.remove();
        });
        menu.appendChild(item);
    });

    document.body.appendChild(menu);

    document.addEventListener("click", (e) => {
        if (!menu.contains(e.target)) menu.remove();
    }, { once: true });
}
