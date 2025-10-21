// tooltips.js

export function attachTooltip(cyInstance) {
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

  // Node tooltips
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

  // Edge tooltips
  cyInstance.on("mouseover", "edge", (event) => {
  const edge = event.target;
  edge.addClass("highlight");
  tooltip.innerHTML = formatTooltip(edge.data());  // now works for edges
  tooltip.style.display = "block";
  tooltip.style.left = event.originalEvent.pageX + 10 + "px";
  tooltip.style.top = event.originalEvent.pageY + 10 + "px";
  });

  cyInstance.on("mousemove", "edge", (event) => {
    tooltip.style.left = event.originalEvent.pageX + 10 + "px";
    tooltip.style.top = event.originalEvent.pageY + 10 + "px";
  });

  cyInstance.on("mouseout", "edge", (event) => {
    event.target.removeClass("highlight");
    tooltip.style.display = "none";
  });

}

function formatTooltip(data) {
  // Special handling for tables
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

    return `Schema: ${data.owner || "unknown"}\nTable: ${data.id}\nPKs: ${pkText}\nFKs: ${fkText}\nDescription: ${data.description || "N/A"}`;
  }

  // Special handling for columns
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

  /*
  // Special handling for edges in main graph
  if (data.type === "main-graph-edge" || data.type === "table-graph-edge" || data.type === "main-graph-fk-edge") { 
    return `
      Edge: "${data.label || data.id}"
    `;
  }*/

  // Special handling for edges in flow graphs for specific nodes
  if (data.type === "dataflow-edge") { 
    return `
      Flow: ${data.label || data.id}<br>
      Method: ${data.method || "N/A"}<br>
      Bandwidth: ${data.bandwidth || "N/A"}<br>
      Encrypted: ${data.encrypted ? "Yes" : "No"}<br>
      Description: ${data.description || "N/A"}
    `;
  }  
  
  
  // Special handling for source/destination nodes in flow graphs
  if (data.type === "source" || data.type === "destination") {
    // Count connected edges (flows)
    const connectedEdges = window.cyRecord
      ? window.cyRecord.edges().filter(e =>
          e.data('source') === data.id || e.data('target') === data.id
        )
      : [];

    const inbound = connectedEdges.filter(e => e.data('target') === data.id).length;
    const outbound = connectedEdges.filter(e => e.data('source') === data.id).length;

    // Collect some ETL methods for context
    const methods = [...new Set(connectedEdges.map(e => e.data('method')))].filter(Boolean);

    return `
      <b>${data.type === "source" ? "Source System" : "Destination System"}</b><br>
      ID: ${data.id}<br>
      Label: ${data.label || "N/A"}<br>
      Outbound Flows: ${outbound}<br>
      Inbound Flows: ${inbound}<br>      
    `;
  }

  // Special handling for record nodes in record graphs
  if (data.type === "record") {
    return `
      Table: ${data.table_name || "N/A"}<br>
      Column: ${data.column_name || "N/A"}<br>
      Value: ${data.value || "N/A"}<br>
      Description: ${data.description || "N/A"}
    `;
  }

  // Special handling for source/destination nodes in flow graphs for specific nodes
  // Handle all node types that come from the flow graph (dataset, node, poc, etc.)
  if (["dataset", "processing", "user"].includes(data.type)) {
  const connectedEdges = window.cyFlow
    ? window.cyFlow.edges().filter(e =>
        e.data('source') === data.id || e.data('target') === data.id
      )
    : [];

  const inbound = connectedEdges.filter(e => e.data('target') === data.id).length;
  const outbound = connectedEdges.filter(e => e.data('source') === data.id).length;

  const methods = [...new Set(connectedEdges.map(e => e.data('method')))].filter(Boolean);

  return `
    <b>${data.type.replace("_", " ").toUpperCase()}</b><br>
    ID: ${data.id}<br>
    Type: ${data.type || "N/A"}<br>
    Name: ${data.name || "N/A"}<br>
    Outbound Flows: ${outbound}<br>
    Inbound Flows: ${inbound}<br>
    ETL Methods: ${methods.join(", ") || "N/A"}
  `;

  }

  
  // Special handling for the rest of edges
  if (data.type === "dataflow-edge") { 
    return `
      Flow: ${data.label || data.id}<br>
      Method: ${data.method || "N/A"}<br>
      Bandwidth: ${data.bandwidth || "N/A"}<br>
      Encrypted: ${data.encrypted ? "Yes" : "No"}<br>
      Description: ${data.description || "N/A"}
    `;
  }


  return "";
}