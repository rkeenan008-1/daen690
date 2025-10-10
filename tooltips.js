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

  if (data.source && data.target) {   // this is an edge
    return `
      Flow: ${data.label || data.id}<br>
      Method: ${data.method || "N/A"}<br>
      Bandwidth: ${data.bandwidth || "N/A"}<br>
      Encrypted: ${data.encrypted ? "Yes" : "No"}<br>
      Description: ${data.desciption || "N/A"}
    `;
  }

  if (data.type === "record") {
    return `
      Table: ${data.table_name || "N/A"}<br>
      Column: ${data.column_name || "N/A"}<br>
      Value: ${data.value || "N/A"}<br>
      Description: ${data.description || "N/A"}
    `;
  }

  return "";
}