// sidebar.js
import { cy } from "/public/graph.js";

export function buildSidebar(tables, data) {
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

                // Clear Record Graph container
                //const recordContainer = document.getElementById("cy-record-container");
                //if (recordContainer) recordContainer.innerHTML = "";
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

}

export function attachSidebarEvents() {
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