// graph.js

import { disableRightClick } from "/public/cytoscape-helpers.js";
import { attachTooltip } from "/public/tooltips.js";
import { fetchTopRows, fetchJoins, loadFlowForNode } from "/public/api.js";
import { saveGraphAsImage } from "/public/cytoscape-helpers.js";
//import cytoscape from "cytoscape";
//import cytoscapeCoseBilkent from "cytoscape-cose-bilkent";

// ✅ Register the layout plugin before creating any Cytoscape graphs
//cytoscape.use(cytoscapeCoseBilkent);


export let cy;
export let cyTable;
//export let cyRecord;
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
                classes: row.is_primary_key && row.is_foreign_key
                  ? "pkfk"
                  : row.is_primary_key
                  ? "pk"
                  : row.is_foreign_key
                  ? "fk"
                  : "column"
            });
            nodeSet.add(colId);
        }

        const tableEdgeId = `${row.table_name}->${colId}`;
        if (!edgeSet.has(tableEdgeId)) {
            elements.push({
                data: { 
                  id: tableEdgeId, 
                  source: row.table_name, 
                  target: colId, 
                  label: "has_column",
                  type: "main-graph-edge"}
                  
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
                        label: "foreign_key",
                        type: "main-graph-fk-edge"
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
            { selector: ".pkfk", style: { "background-color": "#388E3C", "border-width": 2, "border-color": "#FBC02D" } },
            { selector: ".pk", style: { "background-color": "#388E3C", "border-width": 2, "border-color": "black" } },
            { selector: ".fk", style: { "background-color": "#FBC02D", "border-width": 2, "border-color": "black" } },
            //{ selector: "edge", style: { label: "", "curve-style": "bezier", "target-arrow-shape": "triangle" } }, // no edge labels
            { selector: ".highlight", style: { "border-width": 3, "border-color": "#FFD700" } },

            // Edge default style
            { selector: "edge", style: { label: "", "curve-style": "bezier", "target-arrow-shape": "triangle" } },
            
            // Highlight classes for column-level lineage
            { selector: ".highlight-record", style: { "border-width": 4, "border-color": "#e00b0b", "background-color": "#AED581" } },
            { selector: ".highlight-table", style: { label: "data(label)", shape: "rectangle", "border-color": "#e00b0b", "background-color": "#AED581", "padding": "20px" } },
            { selector: ".highlight-upstream", style: { "line-color": "#2196F3", "target-arrow-color": "#2196F3", "width": 3 } },
            { selector: ".highlight-downstream", style: { "line-color": "#F44336", "target-arrow-color": "#F44336", "width": 3 } },

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

    // --- Visibility filters ---
    document.getElementById("toggle-columns").addEventListener("change", (e) => {
      const show = e.target.checked;
      if (show) {
        cy.nodes(".column").style("display", "element");
      } else {
        cy.nodes(".column").style("display", "none");
      }
    });

    document.getElementById("toggle-pk").addEventListener("change", (e) => {
      const show = e.target.checked;
      if (show) {
        cy.nodes(".pk").style("display", "element");
      } else {
        cy.nodes(".pk").style("display", "none");
      }
    });

    document.getElementById("toggle-fk").addEventListener("change", (e) => {
      const show = e.target.checked;
      if (show) {
        cy.nodes(".fk").style("display", "element");
      } else {
        cy.nodes(".fk").style("display", "none");
      }
    });

    document.getElementById("toggle-pkfk").addEventListener("change", (e) => {
      const show = e.target.checked;
      if (show) {
        cy.nodes(".pkfk").style("display", "element");
      } else {
        cy.nodes(".pkfk").style("display", "none");
      }
    });


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

// Build detailed table graph with columns and FK neighbors
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
            { selector: ".pkfk", style: { "background-color": "#388E3C", "border-width": 2, "border-color": "#FBC02D" } },
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

    // --- Visibility filters ---
    document.getElementById("table-toggle-columns").addEventListener("change", (e) => {
      const show = e.target.checked;
      if (show) {
        cyTable.nodes(".column").style("display", "element");
      } else {
        cyTable.nodes(".column").style("display", "none");
      }
    });

    document.getElementById("table-toggle-pk").addEventListener("change", (e) => {
      const show = e.target.checked;
      if (show) {
        cyTable.nodes(".pk").style("display", "element");
      } else {
        cyTable.nodes(".pk").style("display", "none");
      }
    });

    document.getElementById("table-toggle-fk").addEventListener("change", (e) => {
      const show = e.target.checked;
      if (show) {
        cyTable.nodes(".fk").style("display", "element");
      } else {
        cyTable.nodes(".fk").style("display", "none");
      }
    });

    document.getElementById("table-toggle-pkfk").addEventListener("change", (e) => {
      const show = e.target.checked;
      if (show) {
        cyTable.nodes(".pkfk").style("display", "element");
      } else {
        cyTable.nodes(".pkfk").style("display", "none");
      }
    });

    // Add table node
    const tableOwner = details[0]?.owner || "unknown";
    cyTable.add({ 
        group: "nodes", 
        data: { 
            id: tableName, 
            label: `Table: ${tableName}`, 
            type: "table", 
            columns: details,
            description: details[0]?.description || "",
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
                label: "has_column",
                type: "table-graph-edge" 
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
                label: "has_pk",
                type: "table-graph-edge"
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
                label: "foreign_key",
                type: "table-graph-edge"
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

  attachTooltip(cyTable);

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

    // Allow expanding external nodes on click
    cyTable.on("tap", "node", evt => {
    const node = evt.target;
    const tableId = node.id().split(".")[0]; // extract table name
    
    // get columns of this table from schemaData
    const details = schemaData.filter(r => r.table_name === tableId);

    if (details.length > 0) {
        // upgrade this external node to a full table node
        //node.removeClass("external");
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

  // Show table name in Record Graph title box
  const title = document.getElementById("record-graph-title");
  if (title) {
    title.textContent = `Record Graph for Table: ${baseTable}`;
  }

  const nodes = [];
  const edges = [];
  const seen = new Set();
  

  // Build graph as "flow" type
  if (tableType === "flow") {
      // Build edges: source_id -> destination_id
      rows.forEach(row => {
        const sourceNodeId = `system_${row.source_id}`;
        const destNodeId = `system_${row.destination_id}`;
        
        // add nodes
        if (!seen.has(sourceNodeId)) {
          const srcLabelParts = [
            row["source_id"] ? `ID: ${row["source_id"]}` : null,
            row["source_name"] ? `Name: ${row["source_name"]}` : null,
            row["source_node_type"] ? `Type: ${row["source_node_type"]}` : null
          ].filter(Boolean);

          nodes.push({
            data: {
              id: sourceNodeId,
              type: "source",
              name: row["source_name"] || "",
              label: srcLabelParts.join(" | ")
            }
          });
          seen.add(sourceNodeId);
        }
        console.log("Source Node ID:", sourceNodeId);
        console.log("Source Node Name:", row["source_name"]);
        console.log("Source Node Type:", row["source_node_type"]);

        if (!seen.has(destNodeId)) {
          const dstLabelParts = [
            row["destination_id"] ? `ID: ${row["destination_id"]}` : null,
            row["destination_name"] ? `Name: ${row["destination_name"]}` : null,
            row["dest_node_type"] ? `Type: ${row["dest_node_type"]}` : null
          ].filter(Boolean);

          nodes.push({
            data: {
              id: destNodeId,
              type: "destination",
              name: row["destination_name"] || "",
              label: dstLabelParts.join(" | ")
            }
          });
          seen.add(destNodeId);
        }
        console.log("Source Node ID:", destNodeId);
        console.log("Source Node Name:", row["destination_name"]);
        console.log("Source Node Type:", row["dest_node_type"]);


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
              description: row.dataflow_description || ""
            },
            classes: "flow-edge"
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
      { selector: "edge", style: { label: "data(label)", "font-size": "10px", "curve-style": "bezier", "target-arrow-shape": "triangle", "text-margin-y": "-6px" } },
      { selector: ".hidden", style: { display: "none" } },
      { selector: ".filtered-out", style: { display: "none" } }
    ]
  });

  // --- Instruction overlay ---
  const instruction = document.createElement("div");
  instruction.innerHTML = `
    💡 <b>Tip:</b> Left-click a node to <b>hide</b> it.<br>
      Right-click background for <b>save options</b>.<br>
        `;
  instruction.style.position = "absolute";
  instruction.style.bottom = "50px";
  instruction.style.right = "10px";
  instruction.style.background = "rgba(255, 255, 255, 0.9)";
  instruction.style.padding = "6px 10px";
  instruction.style.borderRadius = "8px";
  instruction.style.fontSize = "11px";
  instruction.style.boxShadow = "0 1px 4px rgba(0,0,0,0.2)";
  instruction.style.zIndex = 1000;
  instruction.style.pointerEvents = "none"; // ✅ lets clicks pass through

  // Append it on top of the graph container
  const cyContainer = document.getElementById("cy-record-container");
  cyContainer.style.position = "relative";
  cyContainer.appendChild(instruction);
  // --- End instruction overlay ---

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

// Trace column lineage for a specific record (by PK value) and highlight in main graph
export function traceColumnLineage(table, pkValue, columns = []) {
    console.log("traceColumnLineage called!");
    console.log("tableName:", table);
    console.log("rowId:", pkValue);
    console.log("columns:", columns);  
  
    if (!cy) {
      console.warn("Main graph 'cy' is not initialized!");
      return;
    }
    //const cy = window.cy;

    // Reset previous highlights
    cy.nodes().removeClass('highlight-upstream highlight-downstream highlight-record');

    // Step 1: Highlight columns of the record itself
    let recordCols = columns.length > 0
        ? columns.map(col => `${table}.${col}`)
        : cy.nodes().filter(node => node.data('table') === table).map(node => node.id());

    //console.log("Record columns to highlight:", recordCols);

    recordCols.forEach(id => {
        const node = cy.$id(id);
        if (node.length) {
            console.log("Found node to highlight:", id);
            node.addClass('highlight-record');
        } else {
            console.warn("No node found for:", id);
        }
    });


    // List all table node IDs in the main graph
    const tableNodeIds = cy.nodes('[type="table"]').map(n => n.id());
    console.log("Table nodes in main graph:", tableNodeIds);

    cy.nodes().forEach(n => {
        if (n.data('table') === 'attribute') {
            console.log(n.data());
        }
    });

    // Step 1b: Highlight the table node itself
   
    let tableNode = cy.nodes().filter(node => node.data('table') === table && node.data('type') === 'table');
      if (tableNode.length) {
          tableNode.addClass('highlight-table');
          console.log("Highlighted table node:", table);
      } else {
          console.warn("No table node found for:", table);
      }

    // Step 2: Highlight upstream and downstream edges/columns based on PK/FK
    recordCols.forEach(id => {
        const node = cy.$id(id)[0];
        if (!node) return;

        const isPK = node.data('isPK');
        const isFK = node.data('isFK');

        // --- FK: trace upstream to referenced PKs ---
        if (isFK) {
            console.log("Tracing upstream for FK:", id);
            let upstreamEdges = cy.edges().filter(edge => edge.data('target') === id);
            if (upstreamEdges.length === 0) console.log("No upstream edges found for", id);
            upstreamEdges.forEach(edge => {
                edge.addClass('highlight-upstream');
                edge.source().addClass('highlight-upstream');
            });
        }

        // --- PK: trace downstream to referencing FKs ---
        if (isPK) {
            console.log("Tracing downstream for PK:", id);
            let downstreamEdges = cy.edges().filter(edge => edge.data('source') === id);
            if (downstreamEdges.length === 0) console.log("No downstream edges found for", id);
            downstreamEdges.forEach(edge => {
                edge.addClass('highlight-downstream');
                edge.target().addClass('highlight-downstream');
            });
        }
    });

    console.log("Column lineage highlighting complete.");


    // Step 4: Fit the graph to show all highlighted nodes
    const highlightedNodes = cy.nodes('.highlight-upstream, .highlight-downstream, .highlight-record');
    if (highlightedNodes.length > 0) cy.fit(highlightedNodes, 50);
}

// Build a flow graph from flowData
export function buildFlowGraph(data, centerNodeId) {
  console.log("buildGraph received data:", data);

  // clear previous graph safely
  if (window.cyFlow) {
    window.cyFlow.destroy();  // ✅ remove old Cytoscape instance from DOM and memory
    window.cyFlow = null;
  }

  if (window.cyRecord) {
    window.cyRecord.destroy();  // ✅ remove old Cytoscape instance from DOM and memory
    window.cyRecord = null;
  }

  const container = document.getElementById("cy-record-container");
  container.innerHTML = "";   // ✅ clear HTML container

  // Clear FK filter UI
  const fkFiltersContainer = document.getElementById("fk-filters");
  fkFiltersContainer.innerHTML = "";
  

  // Show node name in Flow Graph title box
  const title = document.getElementById("record-graph-title");
  if (title) {
    title.textContent = `Flow Graph for Node: ${centerNodeId}`;
  }


    if (!Array.isArray(data)) {
        console.error("❌ buildGraph expected an array but got:", typeof data);
        return;
    }
  const elements = [];
  const nodeSet = new Set();
  const edgeSet = new Set();

  data.forEach(row => {
    const src = row.source_id;
    const dst = row.destination_id;

    // --- Nodes ---
    [src, dst].forEach(id => {
      if (id && !nodeSet.has(id)) {
        const type = (id === src ? row.source_node_type : row.dest_node_type) || "unknown";
        const label = (id === src ? row.source_name : row.destination_name) || id;

        // Combine for display
        const displayLabel = `${id}\n${label}\n(${type})`;

        elements.push({
          data: {
            id,
            label: displayLabel,
            name: label,
            type
          },
          classes: `node-type-${type}`
        });
        nodeSet.add(id);
      }
    });

    console.log("Processed Elements:", elements);

    // --- Edges ---
    const edgeId = `${src}->${dst}`;
    const edgeLabel = row.dataflow_id || "unknown";
    const displayEdgeLabel = `${edgeId}\n(${edgeLabel})`;

    console.log("Edge label:", row.dataflow_id);  

    if (!edgeSet.has(edgeId)) {
      elements.push({
        data: {
          id: edgeId,
          label: row.dataflow_id,
          method: row.ETL_method,
          bandwidth: row.max_gb_per_second,
          encrypted: row.fully_encrypted,
          description: row.dataflow_description,
          source: src,
          target: dst,
          type: "dataflow-edge"        
        },
        classes: "dataflow-edge"
      });
      edgeSet.add(edgeId);
    }
  
  });
  

  // --- Initialize Cytoscape ---
  const cyFlow = cytoscape({
    container: document.getElementById("cy-record-container"), // ✅ Show in Record Graph
    elements,
    layout: { name: "cose", animate: true },
    style: [
      { selector: "node", style: { "label": "data(label)", "color": "#000", "text-outline-color": "#333", "text-outline-width": 0, "text-wrap": "wrap", "font-size": "8px" }},
      { selector: ".node-type-dataset", style: { "background-color": "#4CAF50", "shape": "ellipse" }},
      { selector: ".node-type-processing", style: { "background-color": "#2196F3", "shape": "round-rectangle" }},
      { selector: ".node-type-user", style: { "background-color": "#FF9800", "shape": "hexagon" }},
      //{ selector: ".node-type-node", style: { "background-color": "#9C27B0", "shape": "rectangle" }},
      { selector: "edge", style: { "curve-style": "bezier", "target-arrow-shape": "triangle", "width": 2, "line-color": "#ccc", "target-arrow-color": "#ccc" }},
      { selector: ".dataflow-edge", style: { "label": "data(label)", "line-color": "#635e5e", "target-arrow-color": "#635e5e", "font-size": "8px", "text-margin-y": "-6px" }},
      { selector: ".hidden", style: { display: "none" } },
      { selector: `.node[id="${centerNodeId}"]`, style: { "border-color": "#FFD700", "border-width": 4, "background-color": "#FFEB3B", "color": "#000" } }
    ]
  });

  window.cyFlow = cyFlow; // make globally accessible for other functions

  // --- Instruction overlay ---
  const instruction = document.createElement("div");
  instruction.innerHTML = `
    💡 <b>Tip:</b> Left-click a node to <b>expand</b> it.<br>
        Right-click a node to <b>hide</b> it.
        `;
  instruction.style.position = "absolute";
  instruction.style.bottom = "50px";
  instruction.style.right = "10px";
  instruction.style.background = "rgba(255, 255, 255, 0.9)";
  instruction.style.padding = "6px 10px";
  instruction.style.borderRadius = "8px";
  instruction.style.fontSize = "11px";
  instruction.style.boxShadow = "0 1px 4px rgba(0,0,0,0.2)";
  instruction.style.zIndex = 1000;
  instruction.style.pointerEvents = "none"; // ✅ lets clicks pass through

  // Append it on top of the graph container
  const cyContainer = document.getElementById("cy-record-container");
  cyContainer.style.position = "relative";
  cyContainer.appendChild(instruction);
  // --- End instruction overlay ---

  // Add tooltips
  attachTooltip(cyFlow);

  // Right-click on background → show context menu to save graph
  cyFlow.on("cxttap", (evt) => {
    if (evt.target === cyFlow) {   // only trigger on background
      evt.originalEvent.preventDefault();
      evt.originalEvent.stopPropagation();

      showMenu(evt.originalEvent.pageX, evt.originalEvent.pageY, [
        {
          label: "Save as PNG",
          action: () => saveGraphAsImage(cyFlow, "png")
        },
        {
          label: "Save as JPG",
          action: () => saveGraphAsImage(cyFlow, "jpg")
        },
        {
          label: "Save as SVG",
          action: () => saveGraphAsImage(cyFlow, "svg")
        }
      ]);
    }
  });

  // --- Focus on clicked node ---
  cyFlow.ready(() => {
    const centerNode = cyFlow.$id(centerNodeId);
    if (centerNode) {
      cyFlow.center(centerNode);
      cyFlow.fit(centerNode, 100);
    }
  });

  // Keep track of expanded nodes
  const expandedNodes = new Set();

  // --- Node click to expand ---
  cyFlow.on("tap", "node", async (evt) => {
    const nodeId = evt.target.id();

    // Prevent re-expanding the same node
    if (expandedNodes.has(nodeId)) return;
    expandedNodes.add(nodeId);

    console.log("Expanding node:", nodeId);
    
    try {
      // Fetch connected flows for this node
      const newData = await loadFlowForNode(nodeId);
      
      const newElements = [];
      const existingIds = new Set(cyFlow.nodes().map(n => n.id()));

      newData.forEach(row => {
        const src = row.source_id;
        const dst = row.destination_id;

        // Add source node if not exists
        if (!existingIds.has(src)) {
          const type = row.source_node_type || "unknown";
          const label = row.source_name || src;
          newElements.push({
            data: { 
              id: src, 
              label: `${src}\n${label}\n(${type})`,
              name: label, 
              type },
            classes: `node-type-${type}`
          });
          existingIds.add(src);
        }

        // Add destination node if not exists
        if (!existingIds.has(dst)) {
          const type = row.dest_node_type || "unknown";
          const label = row.dest_name || dst;
          newElements.push({
            data: { 
              id: dst, 
              label: `${dst}\n${label}\n(${type})`,
              name: label, 
              type },
            classes: `node-type-${type}`
          });
          existingIds.add(dst);
        }

        // Add edge if not exists
        const edgeId = `${src}->${dst}`;
        if (!cyFlow.$id(edgeId).length) {
          newElements.push({
            data: { 
              id: edgeId, 
              source: src, 
              target: dst, 
              label: row.dataflow_id,              
              method: row.ETL_method,
              bandwidth: row.max_gb_per_second,
              encrypted: row.fully_encrypted,
              description: row.dataflow_description,
              type: "dataflow-edge"             
            },
            classes: "dataflow-edge"
          });
        }
      });

      // Add new elements to Cytoscape and re-layout
      cyFlow.add(newElements);
      cyFlow.layout({ name: "cose", animate: true }).run();

    } catch (err) {
      console.error("Error expanding node:", err);
    }
  });
  //--- End node click to expand ---

  // Hide a node by its id
  function hideNodeById(nodeId) {
    const node = window.cyFlow.$id(nodeId);
    if (node.nonempty()) {
        node.addClass("hidden");
        node.connectedEdges().addClass("hidden");
        refreshHiddenNodeList();
    }
  }

  // Unhide a node by its id
  function unhideNodeById(nodeId) {
    const node = window.cyFlow.$id(nodeId);
    if (node.nonempty()) {
        node.removeClass("hidden");
        node.connectedEdges().removeClass("hidden");
    }
  }

  // Toggle node visibility
  function toggleNodeById(nodeId) {
    const node = window.cyFlow.$id(nodeId);
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
    const hiddenNodes = window.cyFlow.nodes('.hidden').sort((a, b) => {
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
  window.cyFlow.on("cxttap", "node", evt => {
    const nodeId = evt.target.id();
    toggleNodeById(nodeId);
  });


  return cyFlow;
}

// Build record-level graph from a PK/FK value
export async function buildRecordGraphFromValue(table, column, value) {
  console.log(`🔍 buildRecordGraphFromValue(): ${table}.${column} = ${value}`);

  // clear previous graph safely
  if (window.cyFlow) {
    window.cyFlow.destroy();  // ✅ remove old Cytoscape instance from DOM and memory
    window.cyFlow = null;
  }

  if (window.cyRecord) {
    window.cyRecord.destroy();  // ✅ remove old Cytoscape instance from DOM and memory
    window.cyRecord = null;
  }

  const container = document.getElementById("cy-record-container");
  container.innerHTML = "";   // ✅ clear HTML container

  // Clear FK filter UI
  const fkFiltersContainer = document.getElementById("fk-filters");
  fkFiltersContainer.innerHTML = "";

  try {
    // --- Step 1. Fetch related records from backend ---
    const response = await fetch(`/api/records/expand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, column, value })
    });

    // Debug: see what comes from backend
    console.log("Backend response for record expansion:", response);
    console.log("Backend response for record expansion:", JSON.stringify(response, null, 2));

    if (!response.ok) {
      throw new Error(`Failed to fetch related records for ${table}.${column}`);
    }

    const result = await response.json();

    if (!result || !Array.isArray(result.rows) || result.rows.length === 0) {
      console.warn(`⚠️ No related records found for ${table}.${column} = ${value}`);
      alert("No related records found.");
      return;
    }

    console.log(`✅ Received ${result.rows.length} related records for ${table}`);

    // --- Step 2. Initialize or reuse cyRecord graph ---
    const cyRecordContainer = document.getElementById("cy-record-container");
    if (!cyRecordContainer) {
      console.error("❌ cy-record-container not found in DOM");
      return;
    }

    if (!window.cyRecord) {
      window.cyRecord = cytoscape({
        container: cyRecordContainer,
        elements: [],
        style: [ //{ selector: "node", style: { label: "data(label)", "text-wrap": "wrap", "font-size": "8px", "border-width": 1, "border-color": "#555", color: "#000", "text-halign": "center", "text-valign": "center" }},
          //{ selector: ".record-node", style: { "background-color": "#2E7D32", "border-color": "#000000", "font-weight": "bold", "text-outline-width": 1, "text-outline-color": "#000000" }},
          //{ selector: ".fk-node", style: { "background-color": "#f3d721", "border-color": "#000000", "text-outline-width": 1, "text-outline-color": "#000000" }},
          //{ selector: "edge", style: { label: "data(label)", "curve-style": "bezier", "target-arrow-shape": "triangle", "line-color": "#999", "target-arrow-color": "#999", "width": 1.5, "font-size": "8px", color: "#555" } },
          { selector: 'edge', style: { 'width': 2, 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'arrow-scale': 1.2, 'line-color': '#ccc', 'target-arrow-color': '#ccc', 'label': 'data(label)', 'font-size': 10, 'text-background-opacity': 1, 'text-background-color': '#fff', 'text-background-padding': 2, 'text-rotation': 'autorotate' } },
          { selector: '.edge-downstream', style: { 'line-color': '#28a745', 'target-arrow-color': '#28a745' } },
          { selector: '.edge-upstream', style: { 'line-color': '#007bff', 'target-arrow-color': '#007bff' } },
          { selector: 'node', style: {label: 'data(label)', 'background-color': '#999', "border-width": 1, 'border-color': "#000000", 'text-valign': 'center', 'color': '#000000', 'font-size': 11, 'shape': 'roundrectangle', 'width': 'label', 'padding': '1px', 'text-wrap': 'wrap' } },
          //{ selector: '.record-node', style: { 'background-color': '#4CAF50' } },
          //{ selector: '.fk-node', style: { 'background-color': '#f3d721' } },
          {
            selector: "node.highlighted",
            style: {
              "border-color": "#ff7700",
              "border-width": 3,
              "background-color": "#fff8dc",   // light golden background
              "color": "#000",
              //"text-outline-color": "#ff7700",
              //"text-outline-width": 1,
              "transition-property": "border-width, border-color, background-color",
              "transition-duration": "0.3s"
            }
          },
          {
            selector: ".highlighted-edge",
            style: {
              "line-color": "#ff7700",
              "target-arrow-color": "#ff7700",
              "width": 4,
              "opacity": 1
            }
          }
          ],
        //layout: { name: "cose", animate: true }
        layout: {
          name: 'cose-bilkent',
          nodeRepulsion: 4500,
          idealEdgeLength: 120,
          edgeElasticity: 0.2,
          gravity: 0.25,
          numIter: 2500,
          randomize: true,
          animate: true
        }

      });
    }

    // --- Search and Reset Controls ---
    const searchInput = document.getElementById("recordSearch");
    const resetButton = document.getElementById("resetHighlights");

    searchInput.addEventListener("input", e => {
      const query = e.target.value.trim().toLowerCase();
      if (!cyRecord) return;

      // Clear previous highlights
      cyRecord.elements().removeClass("highlighted highlighted-edge");

      // Restore original colors
      cyRecord.nodes().forEach(node => {
        const origColor = node.data("origColor");
        if (origColor) node.style("background-color", origColor);
      });

      if (!query) return;

      const matches = cyRecord.nodes().filter(n => 
        n.data("label")?.toLowerCase().includes(query) ||
        n.data("column_name")?.toLowerCase().includes(query) ||
        n.data("value")?.toString().toLowerCase().includes(query)
      );

      if (matches.length > 0) {
        console.log(`🎯 Found ${matches.length} matching nodes`);

        // Save each node’s original color before changing it
        matches.forEach(node => {
          if (!node.data("origColor")) {
            node.data("origColor", node.style("background-color"));
          }
        });

        // Add highlight classes for border, glow, etc.
        matches.addClass("highlighted");

        // Optionally change node fill color dynamically
        matches.style("background-color", "#fff8dc"); // light gold

        // Highlight connected edges
        const connectedEdges = matches.connectedEdges();
        connectedEdges.addClass("highlighted-edge");

        // Animate zoom to matched area
        cyRecord.animate({
          fit: { eles: matches.union(connectedEdges), padding: 80 },
          duration: 600,
          easing: "ease-in-out"
        });
      }
    });

    resetButton.addEventListener("click", () => {
      console.log("🔄 Reset highlights");
      if (!cyRecord) return;

      // Remove highlight classes
      cyRecord.elements().removeClass("highlighted highlighted-edge");

      // Restore original colors
      cyRecord.nodes().forEach(node => {
        const origColor = node.data("origColor");
        if (origColor) {
          node.style("background-color", origColor);
        }
        node.data("origColor", null); // clear saved color
      });

      // Reset zoom
      cyRecord.animate({
        fit: { eles: cyRecord.elements(), padding: 80 },
        duration: 600,
        easing: "ease-in-out"
      });

      // Clear search input
      searchInput.value = "";
    });


    // --- Step 3. Add nodes and edges to record graph ---
    appendRecordsToGraph(window.cyRecord, result.rows, table);

    console.log("🧠 Record graph expanded for:", `${table}.${column}=${value}`);

  } catch (err) {
    console.error("❌ Error in buildRecordGraphFromValue():", err);
    alert("Error expanding record graph. Check console for details.");
  }
}

// Append new records to existing cyRecord graph
export function appendRecordsToGraph(cyRecord, newRows, tableName, sourceNodeData = null, direction = "downstream") {
  console.log(`🧩 appendRecordsToGraph(${tableName}) direction=${direction}`);
  console.log(`🧩 Source Node(${sourceNodeData})`);

  if (!cyRecord) {
    console.error("❌ cyRecord is undefined — cannot append nodes.");
    return;
  }
  if (!Array.isArray(newRows) || newRows.length === 0) {
    console.warn(`⚠️ No rows to append for table ${tableName}`);
    return;
  }

  // --- Identify PK and FK columns ---
  const tableSchema = schemaData.filter(r => r.table_name === tableName);
  const pkCols = tableSchema.filter(r => r.is_primary_key).map(r => r.column_name);
  const fkCols = tableSchema.filter(r => r.is_foreign_key).map(r => r.column_name);

  console.log(`   PK columns: ${pkCols.join(", ")}`);
  console.log(`   FK columns: ${fkCols.join(", ")}`);

  const seen = new Set(cyRecord.nodes().map(n => n.id()));

  newRows.forEach(row => {
    // --- Build PK node(s) ---
    const pkCols = tableSchema.filter(r => r.is_primary_key).map(r => r.column_name);
    if (pkCols.length === 0) return; // skip tables without PK

    const pkCol = pkCols[0]; // assuming one PK column per table
    const pkVal = row[pkCol];
    if (pkVal == null) return;

    const pkNodeId = `${tableName}_${pkCol}_${pkVal}`;
    console.log('Pk Node ID:', pkNodeId);

    if (!seen.has(pkNodeId)) {
      cyRecord.add({
        group: "nodes",
        data: {
          id: pkNodeId,
          table_name: tableName,
          column_name: pkCol,
          value: pkVal,
          label: `${tableName}: ${pkCol}=${pkVal}`,
          type: "record"
        },
        style: {
          'background-color': getColorForTable(tableName)
        }
        //classes: "record-node"
      });
      seen.add(pkNodeId);

      // ✅ Attach expansion click
      cyRecord.$id(pkNodeId).one("tap", async evt => {
        console.log(`🔵 Detected click on ${evt.target.id()}`);
        const { table_name, column_name, value } = evt.target.data();
        console.log(`🟢 Expanding PK node ${evt.target.id()}`);
        await expandRecordNode(table_name, column_name, value);
      });
    }


    // --- Connect to source node (if exists) ---
    if (sourceNodeData) {
      const srcId = `${sourceNodeData.table_name}_${sourceNodeData.column_name}_${sourceNodeData.value}`;
      console.log('Source ID: ', srcId);
      const edgeId = `${srcId}_${pkNodeId}`;
      console.log('Edge ID: ', edgeId);

      if (cyRecord.getElementById(edgeId).empty()) {
        cyRecord.add({
          group: "edges",
          data: {
            id: edgeId,
            source: srcId,
            target: pkNodeId,
            label: `(${sourceNodeData.table_name}→${tableName}) : ${sourceNodeData.column_name}`
          },
          classes: direction === "upstream" ? "edge-upstream" : "edge-downstream"
        });
        console.log(`🔗 Linked expanded node ${pkNodeId} to source ${srcId}`);
      }
    }

    // --- Build FK nodes ---
    fkCols.forEach(fkCol => {
      const fkVal = row[fkCol];
      if (fkVal == null) return;

      const fkNodeId = `${tableName}_${fkCol}_${fkVal}`;
      console.log('FK Node ID: ', fkNodeId);
      if (!seen.has(fkNodeId)) {
        cyRecord.add({
          group: "nodes",
          data: {
            id: fkNodeId,
            table_name: tableName,
            column_name: fkCol,
            value: fkVal,
            label: `${tableName}: ${fkCol}=${fkVal}`,
            type: "foreign-key"
          },
          style: {
          'background-color': getColorForTable(tableName)
          }
          //classes: "record-node"
        });
        seen.add(fkNodeId);

        // ✅ Attach FK node expansion
        cyRecord.$id(fkNodeId).one("tap", async evt => {
          console.log(`🔵 Detected click on ${evt.target.id()}`);
          const { table_name, column_name, value } = evt.target.data();
          console.log(`🔵 Expanding FK node ${evt.target.id()}`);
          await expandRecordNode(table_name, column_name, value);
        });
      }

      // --- Add edge from PK → FK ---
      const edgeId = `${pkNodeId}_${fkNodeId}`;
      if (pkNodeId !== fkNodeId && cyRecord.getElementById(edgeId).empty()) {
        cyRecord.add({
          group: "edges",
          data: { 
            id: edgeId, 
            source: pkNodeId, 
            target: fkNodeId, 
            label: fkCol 
          },
          //classes: "edge-downstream"
        });
      }
    });
  });

  cyRecord.layout({ name: "cose", animate: true }).run();
}

async function expandRecordNode(tableName, columnName, value) {
  console.log(`🔍 expandRecordNode(): table=${tableName}, column=${columnName}, value=${value}`);

  // Step 1️⃣ – Find related tables (upstream/downstream)
  const { upstream, downstream } = getRelatedTables(tableName);
  console.log(`🔗 Related tables for ${tableName}:`);
  console.log("   ⬆️ Upstream:", upstream);
  console.log("   ⬇️ Downstream:", downstream);

  // Step 2️⃣ – Find all schema relationships that involve this table
  const relatedRels = schemaData.filter(
    r => r.table_name === tableName || r.foreign_table === tableName
  );

  if (relatedRels.length === 0) {
    console.warn(`⚠️ No relationships found for ${tableName}`);
    return;
  }

  // Step 3️⃣ – Expand each related relationship
  for (const rel of relatedRels) {
    const isDownstream = rel.table_name === tableName;
    const relatedTable = isDownstream ? rel.foreign_table : rel.table_name;
    const relatedColumn = isDownstream ? rel.foreign_column : rel.column_name;
    const direction = isDownstream ? "downstream" : "upstream";
  
    if (!relatedTable || !relatedColumn) {
      console.warn(`⚠️ Skipping invalid relationship:`, rel);
      continue;
    }

    console.log(
      `➡️ Expanding ${isDownstream ? "downstream" : "upstream"}: ${tableName}.${columnName}.${value} → ${relatedTable}.${relatedColumn}.${value}`
    );

    try {
      const res = await fetch("/api/records/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: relatedTable,
          column: relatedColumn,
          value: value
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.rows?.length > 0) {
        console.log(`🧩 Found ${data.rows.length} related rows in ${relatedTable}`);
        console.log("Frontend received search results:", data);
        //appendRecordsToGraph(window.cyRecord, data.rows, relatedTable, );
        await appendRecordsToGraph(window.cyRecord, data.rows, relatedTable, {
          table_name: tableName,
          column_name: columnName,
          value: value
        }, direction);
      } else {
        console.warn(`⚠️ No rows found in related table ${relatedTable}`);
      }

      // ✅ Debug log
    

    } catch (err) {
      console.error(`❌ Error expanding ${relatedTable}:`, err);
    }
  }
}

// Helper to find related tables via FKs
  function getRelatedTables(baseTable) {
    console.group(`🔍 getRelatedTables("${baseTable}")`);
    // Preview a few schemaData entries
    console.log("📄 Sample schemaData rows:", schemaData.slice(0, 5));
    const upstream = schemaData
      .filter(r => r.table_name === baseTable && r.is_foreign_key)
      .map(r => r.foreign_table)
      .filter(Boolean);

    const downstream = schemaData
      .filter(r => r.foreign_table === baseTable)
      .map(r => r.table_name)
      .filter(Boolean);

    return { upstream, downstream };
  }

  // --- Global color registry so each table keeps the same color across expansions ---
  const tableColors = {};
  const palette = ['#FFB6C1', '#ADD8E6', '#90EE90', '#FFD700', '#FFA07A', '#BA55D3', '#87CEEB'];
  let colorIndex = 0;

  function getColorForTable(table) {
    if (!tableColors[table]) {
      tableColors[table] = palette[colorIndex % palette.length];
      colorIndex++;
    }
    return tableColors[table];
  }













