// graph.js

import { disableRightClick } from "./cytoscape-helpers.js";
import { attachTooltip } from "./tooltips.js";
import { fetchTopRows, fetchJoins } from "./api.js";
import { saveGraphAsImage } from "./cytoscape-helpers.js";

export let cy;
export let cyTable;
export let schemaData = []; // Store full schema data globally

// Fetch schema and build initial graph
export function buildGraph(data) {
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

    // Initialize Cytoscape
    cy = cytoscape({
        container: document.getElementById("cy-main"),
        elements: elements,
        layout: { name: "cose" },
        style: [
            { selector: "node", style: { label: "", "font-size": "12px" } }, // no labels by default
            { selector: "node[type='table']", style: { label: "data(label)", shape: "rectangle", "background-color": "#818b8a", "padding": "20px" } },
            { selector: ".column", style: { shape: "ellipse", "background-color": "#64B5F6" } },
            { selector: ".pkfk", style: { "background-color": "linear-gradient(45deg, #388E3C 50%, #FBC02D 50%)", "border-width": 2, "border-color": "#000" } },
            { selector: ".pk", style: { "background-color": "#388E3C", "border-width": 2, "border-color": "black" } },
            { selector: ".fk", style: { "background-color": "#FBC02D", "border-width": 2, "border-color": "black" } },
            { selector: "edge", style: { label: "", "curve-style": "bezier", "target-arrow-shape": "triangle" } }, // no edge labels
            { selector: ".highlight", style: { "border-width": 3, "border-color": "#FFD700" } },

            // Highlight classes for Cytoscape
            { selector: ".highlight-hover", style: { "border-width": 3, "border-color": "#FFD700" } },
            { selector: ".highlight-search", style: { "border-width": 3, "border-color": "#FFD700", "background-color": "#FFF176" } },
            { selector: ".highlight-selected", style: { "border-width": 4, "border-color": "#e00b0b", "background-color": "#AED581" } }

        ],

        // --- Restrict pan/zoom ---
        wheelSensitivity: 1,
        minZoom: 0.2,
        maxZoom: 2,

        userPanningEnabled: true,
        boxSelectionEnabled: false
    });

    disableRightClick(cy); // BLOCK RIGHT-CLICK HERE

    attachTooltip(cy);

    // Force resize + fit so graph doesn’t overflow
    setTimeout(() => {
      cy.resize();
      cy.fit(cy.elements(), 50); // 50px padding
    }, 100);

    // Left-click on a table node → open table graph view
    cy.on("tap", "node[type='table']", evt => { 
      const nodeData = evt.target.data(); 
      //document.getElementById("node-info").textContent = JSON.stringify(nodeData, null, 2); 
      buildTableGraph(nodeData.id, nodeData.columns, true); 
    });

    // Left-click on a column node → show it in Selected Graph
    cy.on("tap", "node[type='column']", evt => {
      const nodeData = evt.target.data();
      //document.getElementById("node-info").textContent = JSON.stringify(nodeData, null, 2);

      // Build a mini-graph centered on this column
      buildColumnGraph(nodeData);
    });


 
    // Right-click on table node → show context menu
    cy.on("cxttap", "node[type='table']", evt => {
      evt.originalEvent.preventDefault();  // stop browser context menu
      evt.originalEvent.stopPropagation();  // stop bubbling
      const table = evt.target.data("id");

      showMenu(evt.originalEvent.pageX, evt.originalEvent.pageY, [
        {
          label: "Generate SELECT * Query",
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

//
function buildTableGraph(tableName, details, addExternalNodes = true) {
    const container = document.getElementById("cy-table-container");
    container.innerHTML = "";

    cyTable = cytoscape({
        //container: container,
        container: document.getElementById("cy-table-container"),
        elements: [],
        style: [
            { selector: "node", style: { label: "", "font-size": "12px" } }, // no labels by default
            { selector: "node[type='table']", style: { label: "data(label)", shape: "rectangle", "background-color": "#818b8a", "padding": "10px" } },
            { selector: ".pkfk", style: { "background-color": "linear-gradient(45deg, #388E3C 50%, #FBC02D 50%)", "border-width": 2, "border-color": "#000" } },
            { selector: ".column", style: { shape: "ellipse", "background-color": "#64B5F6" } },
            { selector: ".pk", style: { "background-color": "#388E3C", "border-width": 2, "border-color": "black" } },
            { selector: ".fk", style: { "background-color": "#FBC02D", "border-width": 2, "border-color": "black" } },
            { selector: "node.external", style: { "background-color": "#852670", shape: "rectangle" } },
            { selector: "node.expanded", style: { "background-color": "#818b8a", shape: "rectangle" } },
            { selector: "edge", style: { label: "", "curve-style": "bezier", "target-arrow-shape": "triangle" } }, // no edge labels
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
                //classes: (col.is_pk || col.is_primary_key) ? "pk" : (col.is_fk || col.is_foreign_key) ? "fk" : "column"
                classes: (col.is_pk && col.is_fk) ? "pkfk" 
                        : (col.is_pk || col.is_primary_key) ? "pk" 
                        : (col.is_fk || col.is_foreign_key) ? "fk" 
                        : "column"

            });

        }

        // Edge from table → column
        const edgeId = `${tableName}->${colId}`;
                
        if (cyTable.$id(edgeId).empty()) {
            cyTable.add({ 
              group: "edges", 
              data: { 
                id: edgeId, 
                source: tableName, 
                target: colId, 
                label: "has_column" 
              } 
            });
        }

        // Foreign key edge: FK column -> external table's PK column
        if (col.is_fk && col.foreign_table && col.foreign_column) {
          const targetTableId = col.foreign_table;
          const pkColId = `${targetTableId}.${col.foreign_column}`;

          // Add the external table node if not already present
          if (cyTable.$id(targetTableId).empty() && addExternalNodes) {
            const schemaRows = schemaData.filter(r => r.table_name === targetTableId);
            const tableOwner = schemaRows[0]?.owner || "unknown";

            cyTable.add({ 
              group: "nodes", 
              data: { 
                id: targetTableId, 
                label: `Table: ${targetTableId}`, 
                type: "table", 
                owner: tableOwner 
              }, 
              classes: "external" 
            });
          }

          // Add the external PK column node
          if (cyTable.$id(pkColId).empty()) {
            cyTable.add({ 
              group: "nodes", 
              data: { 
                id: pkColId, 
                label: `${col.foreign_column} [PK]`, 
                type: "column", 
                table: targetTableId,
                is_pk: true
              }, 
              classes: "pk"
            });

            // Edge from external table → its PK column
            cyTable.add({
              group: "edges",
              data: {
                id: `${targetTableId}->${pkColId}`,
                source: targetTableId,
                target: pkColId,
                label: "has_pk"
              },
              classes: "containment"
            });
          }

          // Add FK → external PK edge
          const fkEdgeId = `${colId}->${pkColId}`;
          if (cyTable.$id(fkEdgeId).empty()) {
            cyTable.add({ 
              group: "edges", 
              data: { 
                id: fkEdgeId, 
                source: colId, 
                target: pkColId, 
                label: "foreign_key"
              } 
            });
          }
        }

    });

    cyTable.layout({ name: "cose", fit: true }).run();
    cyTable.nodes().forEach(node => node.grabify());

    // ✅ Expand lineage with column-level labels
    const nodes = [];
    const edges = [];
    const seenTables = new Set();
    const seenEdges = new Set();

    expandImmediateNeighbors(tableName, nodes, edges);
    //expandLineage(tableName, nodes, edges, seenTables, seenEdges);
    cyTable.add(nodes);
    cyTable.add(edges);

    cyTable.layout({ name: "cose", animate: true, fit: true }).run();
    
    cyTable.on("tap", "node", evt => {
        //document.getElementById("node-info").textContent = JSON.stringify(evt.target.data(), null, 2);
    });
    
    // Allow expanding external nodes on click
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
    
    // Right-click on table node → show context menu for auto-fetching
    cyTable.on("cxttap", "node[type='table']", evt => {
      evt.originalEvent.preventDefault();  // stop browser context menu
      evt.originalEvent.stopPropagation();  // stop bubbling
      const table = evt.target.data("id");

      showMenu(evt.originalEvent.pageX, evt.originalEvent.pageY, [
        {
          label: "Generate SELECT * Query",
          action: () => fetchTopRows(table)
        },
        {
          label: "Generate SELECT with JOINs",
          action: () => fetchJoins(table)
        }
      ]);
    });
}

// Expand a table node in the graph by adding its columns and immediate FK neighbors
function expandTableInGraph(tableId, cyTable, details, addExternalNodes = true) {
  if (!details || details.length === 0) return;

  // Find the node in Cytoscape
  const node = cyTable.$id(tableId);
  if (!node.length) return;

  // Upgrade node metadata
  node.data("type", "table");
  node.data("label", `Table: ${tableId}`);
  node.data("columns", details);
  node.removeClass("external").addClass("expanded");

  // Add column nodes + edges (table -> column)
  details.forEach(col => {
    const colId = `${tableId}.${col.column_name}`;
    if (cyTable.$id(colId).empty()) {
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
          owner: col.owner || "unknown"
        },
        classes: (col.is_pk || col.is_primary_key) ? "pk"
               : (col.is_fk || col.is_foreign_key) ? "fk"
               : "column"
      });

      const edgeId = `${tableId}->${colId}`;
      if (cyTable.$id(edgeId).empty()) {
        cyTable.add({
          group: "edges",
          data: { id: edgeId, source: tableId, target: colId, label: "has_column" }
        });
      }
    }
  });

  // ✅ Expand upstream + downstream FKs
  const newNodes = [];
  const newEdges = [];
  expandImmediateNeighbors(tableId, newNodes, newEdges);
  cyTable.add(newNodes);
  cyTable.add(newEdges);

  // ✅ Ensure PK columns for any external tables are shown
  newNodes
    .filter(n => n.classes === "external")
    .forEach(extNode => addPKColumnsForExternal(extNode.data.id, newNodes, newEdges, new Set()));

  // Layout update
  cyTable.layout({ name: "cose", animate: true, fit: false }).run();
}

// Build a mini-graph centered on a single column
function buildColumnGraph(colData) {
  const container = document.getElementById("cy-table-container");
  container.innerHTML = "";

  cyTable = cytoscape({
    container,
    elements: [],
    style: [
      { selector: "node", style: { label: "data(label)", "font-size": "12px" } },
      { selector: ".pk", style: { "background-color": "#388E3C" } },
      { selector: ".fk", style: { "background-color": "#FBC02D" } },
      { selector: ".column", style: { "background-color": "#64B5F6" } },
      { selector: "edge", style: { label: "data(label)", "curve-style": "bezier", "target-arrow-shape": "triangle" } }
    ],
    layout: { name: "cose", fit: true }
  });

  // Add the selected column
  cyTable.add({
    group: "nodes",
    data: {
      id: colData.id,
      label: `${colData.label}`,
      type: "column",
      is_pk: colData.is_pk,
      is_fk: colData.is_fk,
      table: colData.table
    },
    classes: colData.is_pk ? "pk" : colData.is_fk ? "fk" : "column"
  });

  // Add its parent table
  cyTable.add({
    group: "nodes",
    data: { id: colData.table, label: `Table: ${colData.table}`, type: "table" }
  });

  // Edge table → column
  cyTable.add({
    group: "edges",
    data: { id: `${colData.table}->${colData.id}`, source: colData.table, target: colData.id, label: "has_column" }
  });

  // If FK, add foreign target
  if (colData.is_fk && colData.foreign_table && colData.foreign_column) {
    const targetId = `${colData.foreign_table}.${colData.foreign_column}`;
    cyTable.add({
      group: "nodes",
      data: { id: targetId, label: targetId, type: "column" },
      classes: "fk"
    });
    cyTable.add({
      group: "edges",
      data: { id: `${colData.id}->${targetId}`, source: colData.id, target: targetId, label: "foreign_key" }
    });
  }

  cyTable.layout({ name: "cose", fit: true }).run();
}

// Expand immediate FK neighbors (both upstream and downstream)
function expandImmediateNeighbors(tableName, nodes, edges) {
    // --- Outbound FKs (downstream) ---
    const downstreamFKs = schemaData.filter(r =>
        r.table_name === tableName &&
        r.is_foreign_key &&
        r.foreign_table &&
        r.foreign_column
    );

    downstreamFKs.forEach(fkRow => {
        const fkColId = `${fkRow.table_name}.${fkRow.column_name}`;
        const pkColId = `${fkRow.foreign_table}.${fkRow.foreign_column}`;

        // Add FK column node
        if (!nodes.find(n => n.data.id === fkColId)) {
            nodes.push({ data: { id: fkColId, label: fkRow.column_name, type: "column", table: fkRow.table_name }, classes: "fk" });
        }

        // Add target PK column node
        if (!nodes.find(n => n.data.id === pkColId)) {
            nodes.push({ data: { id: pkColId, label: fkRow.foreign_column, type: "column", table: fkRow.foreign_table }, classes: "pk" });
        }

        // Add target table node
        if (!nodes.find(n => n.data.id === fkRow.foreign_table)) {
            nodes.push({ data: { id: fkRow.foreign_table, label: `Table: ${fkRow.foreign_table}`, type: "table" }, classes: "external" });
        }

        // Add edges
        edges.push({ data: { id: `${tableName}->${fkColId}`, source: tableName, target: fkColId, label: "has_column" } });
        edges.push({ data: { id: `${fkColId}->${pkColId}`, source: fkColId, target: pkColId, label: "foreign_key" } });
    });

    // --- Inbound FKs (upstream) ---
    const upstreamFKs = schemaData.filter(r =>
        r.is_foreign_key &&
        r.foreign_table === tableName &&
        r.foreign_column
    );

    upstreamFKs.forEach(fkRow => {
        const fkColId = `${fkRow.table_name}.${fkRow.column_name}`; // FK column in upstream table
        const pkColId = `${fkRow.foreign_table}.${fkRow.foreign_column}`; // PK column in selected table

        // ensure upstream PK exists in its own table
        addPKColumnsForExternal(
          fkRow.foreign_table,
          nodes,
          edges,
          new Set(),
          fkRow.foreign_column   // <-- fallback to ensure PK col node exists
        );
        
        // FK column node
        if (!nodes.find(n => n.data.id === fkColId)) {
            nodes.push({ data: { id: fkColId, label: fkRow.column_name, type: "column", table: fkRow.table_name }, classes: "fk" });
        }

        // PK column node (in selected table)
        if (!nodes.find(n => n.data.id === pkColId)) {
            nodes.push({ data: { id: pkColId, label: fkRow.foreign_column, type: "column", table: fkRow.foreign_table }, classes: "pk" });
        }

        // Upstream table node
        if (!nodes.find(n => n.data.id === fkRow.table_name)) {
            nodes.push({ data: { id: fkRow.table_name, label: `Table: ${fkRow.table_name}`, type: "table" }, classes: "external" });
        }

        // Add edges
        edges.push({ data: { id: `${fkRow.table_name}->${fkColId}`, source: fkRow.table_name, target: fkColId, label: "has_column" } }); // FK column → upstream table
        edges.push({ data: { id: `${fkColId}->${pkColId}`, source: fkColId, target: pkColId, label: "foreign_key" } }); // FK → PK
        edges.push({ data: { id: `${fkRow.foreign_table}->${pkColId}`, source: fkRow.foreign_table, target: pkColId, label: "has_column" } }); // **PK → its own table**
    });
}

// Ensure PK columns are added for an external table node
function addPKColumnsForExternal(tableName, nodes, edges, seenEdges, fallbackColumn = null) {
  let schemaRows = schemaData.filter(r => r.table_name === tableName && r.is_primary_key);

  // ⚡ If no PKs were flagged, but we know a fallback FK reference → use that
  if ((!schemaRows || schemaRows.length === 0) && fallbackColumn) {
    schemaRows = [{
      table_name: tableName,
      column_name: fallbackColumn,
      is_primary_key: true
    }];
  }

  schemaRows.forEach(r => {
    const colId = `${r.table_name}.${r.column_name}`;
    if (!nodes.find(n => n.data.id === colId)) {
      nodes.push({
        data: { id: colId, label: r.column_name, type: "column", table: r.table_name },
        classes: "pk"
      });
    }

    const edgeId = `${tableName}->${colId}`;
    if (!seenEdges.has(edgeId)) {
      edges.push({ data: { id: edgeId, source: tableName, target: colId, label: "has_column" } });
      seenEdges.add(edgeId);
    }
  });
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

// Build record-level graph
export function buildRecordGraph(rows, baseTable, tableType) {
  const container = document.getElementById("cy-record-container");
  container.innerHTML = ""; // clear previous graph

  // ✅ NEW: show table name in Record Graph title box
  const title = document.getElementById("record-graph-title");
  if (title) {
    title.textContent = `Record Graph for Table: ${baseTable}`;
  }

  const nodes = [];
  const edges = [];
  const seen = new Set();
  
  // Determine table type
  //const tableType = classifyTableByRows(rows); 
  //console.log(`Classified table ${baseTable} as type: ${tableType}`);
  
  // Build graph as "flow" type
  if (tableType === "flow") {
      // Build edges: source_id -> destination_id
      rows.forEach(row => {
        const sourceNodeId = `system_${row.source_id}`;
        const destNodeId = `system_${row.destination_id}`;
        
        // add nodes
        if (!seen.has(sourceNodeId)) {
          nodes.push({ data: { id: sourceNodeId, label: `${row["source_id"] || ""} - ${row["source_node_type"] || ""}` } });
          seen.add(sourceNodeId);
        }
        if (!seen.has(destNodeId)) {
          nodes.push({ data: { id: destNodeId, label: `${row["destination_id"] || ""} - ${row["dest_node_type"] || ""}` } });
          seen.add(destNodeId);
        }

        // add edge
        const edgeId = `flow_${row.dataflow_id}`;
        if (!seen.has(edgeId)) {
          edges.push({
            data: { 
              id: edgeId, 
              source: sourceNodeId, 
              target: destNodeId,
              label: row.dataflow_id,
              method: row.ETL_method,
              bandwidth: row.max_gb_per_second,
              encrypted: row.fully_encrypted,
              desciption: row.dataflow_description || ""
            }
          });
          seen.add(edgeId);
        }
      });

      //-------- "flow" record graph checkboxes ------------------------------
     
      // Build filter UI (instead of fkCols checkboxes)
      const fkFiltersContainer = document.getElementById("fk-filters");
      fkFiltersContainer.innerHTML = "";

      
      //-------- end "flow" record graph checkboxes ------------------------------
    } 
  
  // Build graph as "node" type
    
  // Lookup: which columns are PK/FK from schemaData
      
      const pkFkCols = new Set(
        schemaData
          .filter(r => r.table_name === baseTable && (r.is_primary_key || r.is_foreign_key))
          .map(r => r.column_name)
      );
      

      // Pull FK columns for joins
      const fkCols = [
      ...new Set(
        schemaData
          .filter(r => r.table_name === baseTable && r.is_foreign_key)
          .map(r => r.column_name)
      )
      ];

    if (tableType === "node") {
      rows.forEach(row => {
        // Keep only PK/FK values
        const filteredCols = Object.entries(row).filter(([col, value]) => {
          return value && pkFkCols.has(col);
        });

        // Add nodes
        filteredCols.forEach(([col, value]) => {
          const nodeId = `${col}_${value}`;
          if (!seen.has(nodeId)) {
            nodes.push({ 
              data: { 
                id: nodeId, 
                type: "record",
                table_name: baseTable,
                column_name: col,
                value: value,
                description: row.description || "", 
                label: `${col}: ${value}` }, 
              classes: pkFkCols.has(col) ? "pkfk" : "other"
            });
            seen.add(nodeId);
          }
        });

        // Add edges (between PK/FK values in same row)
        for (let i = 0; i < filteredCols.length - 1; i++) {
          const source = `${filteredCols[i][0]}_${filteredCols[i][1]}`;
          const target = `${filteredCols[i + 1][0]}_${filteredCols[i + 1][1]}`;
          const edgeId = `${source}_${target}`;
          if (!seen.has(edgeId)) {
            edges.push({ 
              data: { 
                id: edgeId, 
                source, 
                target, 
                label: "", // relationship label could go here
              fkColumn: filteredCols[i + 1][0] 
            } 
          });
            seen.add(edgeId);
          }
        }
      })

      //-------- "node" record graph checkboxes ------------------------------
  
      // Build FK filter UI
      const fkFiltersContainer = document.getElementById("fk-filters");
      fkFiltersContainer.innerHTML = ""; // clear old filters

      fkCols.forEach(col => {
        const label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" value="${col}" checked> ${col}`;
        fkFiltersContainer.appendChild(label);
      });

      // Remove previous listener (by cloning *without* children)
      const freshFkFiltersContainer = fkFiltersContainer.cloneNode(false);
      fkFiltersContainer.replaceWith(freshFkFiltersContainer);

      // Re-add the checkboxes
      fkCols.forEach(col => {
        const label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" value="${col}" checked> ${col}`;
        freshFkFiltersContainer.appendChild(label);
      });

      // FK filter listener
      freshFkFiltersContainer.addEventListener("change", () => {
        const checkedFks = new Set(
          [...freshFkFiltersContainer.querySelectorAll("input:checked")].map(cb => cb.value)
        );

        window.cyRecord.edges().forEach(edge => {
          if (edge.data("fkColumn")) {
            if (checkedFks.has(edge.data("fkColumn"))) {
              edge.removeClass("filtered-out");
            } else {
              edge.addClass("filtered-out");
            }
          }
        });

        // Update node visibility based on edges
        window.cyRecord.nodes().forEach(node => {
          const visibleEdges = node.connectedEdges().filter(e => !e.hasClass("filtered-out") && !e.hasClass("hidden"));
          if (visibleEdges.length === 0 && !node.hasClass("hidden")) {
            node.addClass("filtered-out");
          } else {
            node.removeClass("filtered-out");
          }
        });
      });
          
    };
 
  // Initialize Cytoscape
  window.cyRecord = cytoscape({
    container: container,
    elements: [...nodes, ...edges],
    layout: { name: "cose" },
    style: [
      { selector: "node", style: { label: "data(label)", "font-size": "10px", "background-color": "#90CAF9" } },
      { selector: "node.pkfk", style: { "background-color": "#FF7043", "border-width": 2, "border-color": "#000" } },
      { selector: "edge", style: { label: "data(label)", "font-size": "10px", "curve-style": "bezier", "target-arrow-shape": "triangle" } },
      { selector: ".hidden", style: { display: "none" } },
      { selector: ".filtered-out", style: { display: "none" } }
    ]
  });

  // Add tooltips
  attachTooltip(cyRecord);

  // Right-click on background → show context menu to save graph
  cyRecord.on("cxttap", (evt) => {
    if (evt.target === cyRecord) {   // only trigger on background
      evt.originalEvent.preventDefault();
      evt.originalEvent.stopPropagation();

      showMenu(evt.originalEvent.pageX, evt.originalEvent.pageY, [
        {
          label: "Save as PNG",
          action: () => saveGraphAsImage(cyRecord, "png")
        },
        {
          label: "Save as JPG",
          action: () => saveGraphAsImage(cyRecord, "jpg")
        },
        {
          label: "Save as SVG",
          action: () => saveGraphAsImage(cyRecord, "svg")
        }
      ]);
    }
  });

  // Hide a node by its id
  function hideNodeById(nodeId) {
    const node = window.cyRecord.$id(nodeId);
    if (node.nonempty()) {
        node.addClass("hidden");
        node.connectedEdges().addClass("hidden");
        refreshHiddenNodeList();
    }
  }

  // Unhide a node by its id
  function unhideNodeById(nodeId) {
    const node = window.cyRecord.$id(nodeId);
    if (node.nonempty()) {
        node.removeClass("hidden");
        node.connectedEdges().removeClass("hidden");
    }
  }

  // Toggle node visibility
  function toggleNodeById(nodeId) {
    const node = window.cyRecord.$id(nodeId);
    if (!node.nonempty()) return;

    if (node.hasClass("hidden")) {
        node.removeClass("hidden");
        node.connectedEdges().removeClass("hidden");
    } else {
        node.addClass("hidden");
        node.connectedEdges().addClass("hidden");
    }

    refreshHiddenNodeList(); // keep the UI in sync
  }


  function refreshHiddenNodeList() {
    const container = document.getElementById('hidden-nodes');
    container.innerHTML = '';

    // Get all hidden nodes and sort by label
    const hiddenNodes = window.cyRecord.nodes('.hidden').sort((a, b) => {
        const labelA = a.data('label')?.toLowerCase() || '';
        const labelB = b.data('label')?.toLowerCase() || '';
        return labelA.localeCompare(labelB);
    });

    hiddenNodes.forEach(node => {
        const btn = document.createElement('button');
        btn.textContent = node.data('label');  // show label
        //btn.style.display = 'block';           // vertical layout
        //btn.style.margin = '2px 0';            // small spacing
        btn.addEventListener('click', () => {
            node.removeClass('hidden');
            node.connectedEdges().removeClass('hidden');
            refreshHiddenNodeList(); // update list
        });
        container.appendChild(btn);
    });
  }

  // Hook it into click events
  window.cyRecord.on("tap", "node", evt => {
    const nodeId = evt.target.id();
    toggleNodeById(nodeId);
  });
 

};

// Heuristic to classify table as "node" or "flow" based on columns
function classifyTableByRows(rows) {
  if (!rows || rows.length === 0) return "node";

  const sampleCols = Object.keys(rows[0]);

  if (sampleCols.includes("source_id") && sampleCols.includes("destination_id")) {
    return "flow";  // treat as edges
  }

  // fallback for 2-FK join tables
  const fkCols = sampleCols.filter(c => c.endsWith("_id"));
  if (fkCols.length === 2) return "node";

  return "node";
}

export function highlightAttributeNodeInMainGraph(nodeId) {
  console.log("highlightAttributeNodeInMainGraph called with:", nodeId);

  if (!cy) {
    console.warn("Main graph 'cy' is not initialized!");
    return;
  }

  //const nodeId = `${tableName}.${columnName}`;
  console.log("Looking for nodeId:", nodeId);

  const node = cy.getElementById(nodeId);
  if (!node || node.empty()) {
    console.warn("Node not found in main graph!");
    console.log("Available nodes:", cy.nodes().map(n => n.id()));
    return;
  }

  console.log("Node found, highlighting...");
  cy.nodes().removeClass("highlight-selected"); // clear old highlights
  node.addClass("highlight-selected"); // highlight this node

  // Optional: center/zoom
  cy.center(node);
  cy.zoom({ level: 1.5, position: node.position() });
  cy.animate({
    fit: {
      eles: node,
      padding: 50
    },
    duration: 500
  });
}



