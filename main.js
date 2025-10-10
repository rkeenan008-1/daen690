// main.js
import { submitQuery } from "./api.js"; // handle query submission
import { searchRecords } from "./api.js"; // handle keyword submission
import { buildGraph, cy, cyTable } from "./graph.js"; // build main graph
import { buildSidebar } from "./sidebar.js";        // build sidebar list
import { attachSidebarEvents } from "./sidebar.js";  // sidebar event handlers

// Attach event listener to Run Query button
document.getElementById('run-query').addEventListener('click', submitQuery);

// Attach event listener to Search button
document.getElementById('search-btn').addEventListener('click', searchRecords);

// On page load, fetch and display schema automatically
document.addEventListener("DOMContentLoaded", async () => {
        try {
            // Ask backend to run schema query automatically
            const res = await fetch("/api/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: `SELECT
                        nsp.nspname       AS owner,
                        rel.relname       AS table_name,
                        att.attname       AS column_name,
                        format_type(att.atttypid, att.atttypmod) AS data_type,
                        (con.contype = 'p') AS is_primary_key,
                        (con.contype = 'f') AS is_foreign_key,
                        nsp2.nspname      AS foreign_schema,
                        rel2.relname      AS foreign_table,
                        att2.attname      AS foreign_column
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
                    ORDER BY nsp.nspname, rel.relname, att.attnum;` })
            });

            const data = await res.json();

            if (Array.isArray(data) && data.length > 0) {
            
            const tables = buildGraph(data);   // build graph
            buildSidebar(tables, data);        // build sidebar list
            attachSidebarEvents();


            } else {
            console.error("No schema data returned");
            }
        } catch (err) {
            console.error("Error fetching schema:", err);
        }
    });
  
// Sidebar divider drag logic
const sidebar = document.getElementById("sidebar");
const divider = document.getElementById("sidebar-divider");
let isResizing = false;

divider.addEventListener("mousedown", () => { isResizing = true; });

// mousemove and mouseup on whole window
window.addEventListener("mousemove", e => {
    if (!isResizing) return;
    const newWidth = Math.min(Math.max(e.clientX, 150), 500);
    sidebar.style.width = newWidth + "px";
    });

// Stop resizing on mouse up
window.addEventListener("mouseup", () => { isResizing = false; });

// Graphs divider drag logic
const divider2 = document.getElementById("graphs-divider");
const topPane = document.getElementById("cy-main");
const bottomPane = document.getElementById("cy-table");

let isDragging = false;

divider2.addEventListener("mousedown", (e) => {
  e.preventDefault(); // stop text/image selection
  isDragging = true;
  document.body.style.cursor = "row-resize";
});

// Stop dragging on mouse up
window.addEventListener("mouseup", () => {
  isDragging = false;
  document.body.style.cursor = "default";
});

// Handle mouse move to resize panes
window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  // Calculate new height for cy-main
  const containerTop = divider2.parentNode.getBoundingClientRect().top;
  const offset = e.clientY - containerTop;

  topPane.style.flex = "none";
  topPane.style.height = offset + "px";

  // cy-table fills the rest
  bottomPane.style.flex = "1";
});

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




