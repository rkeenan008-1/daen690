// main.js
import { submitQuery, searchRecords, fetchAndBuildSchema } from "/public/api.js"; // handle query submission
import { cy, cyTable } from "/public/graph.js"; // build main graph
import { generateFlowReport } from "/public/results.js";

// Attach event listener to Run Query button
document.getElementById('run-query').addEventListener('click', submitQuery);

// Attach event listener to Search button
document.getElementById('search-btn').addEventListener('click', searchRecords);

// On page load, fetch and display schema automatically
document.addEventListener("DOMContentLoaded", fetchAndBuildSchema);

// Attach event listener to Generate Report button
document.getElementById("generate-report").addEventListener("click", generateFlowReport);

// =====================
// SIDEBAR RESIZING
// =====================
const sidebar = document.getElementById("sidebar");
const sidebarDivider = document.getElementById("sidebar-divider");
let isResizingSidebar = false;

sidebarDivider.addEventListener("mousedown", () => { isResizingSidebar = true; });
window.addEventListener("mousemove", (e) => {
  if (!isResizingSidebar) return;
  const newWidth = Math.min(Math.max(e.clientX, 150), 500);
  sidebar.style.flex = `0 0 ${newWidth}px`;
  if (cy) cy.resize();
  if (cyTable) cyTable.resize();
  //if (cyRecord) cyRecord.resize?.();
});
window.addEventListener("mouseup", () => { isResizingSidebar = false; });


// =====================
// QUERY PANEL RESIZING
// =====================
const queryPanel = document.getElementById("query-panel");
const graphArea = document.getElementById("graph-area");

const queryDivider = document.createElement("div");
queryDivider.id = "query-divider";
queryDivider.style.height = "6px";
queryDivider.style.background = "#ccc";
queryDivider.style.cursor = "row-resize";
queryDivider.style.flexShrink = "0";
queryPanel.parentNode.insertBefore(queryDivider, graphArea);

let isDraggingQuery = false;
queryDivider.addEventListener("mousedown", (e) => {
  e.preventDefault();
  isDraggingQuery = true;
  document.body.style.cursor = "row-resize";
});

window.addEventListener("mousemove", (e) => {
  if (!isDraggingQuery) return;
  const parentRect = queryPanel.parentNode.getBoundingClientRect();
  const offset = Math.min(Math.max(e.clientY - parentRect.top, 100), parentRect.height - 200);
  queryPanel.style.flex = `0 0 ${offset}px`;
  if (cy) cy.resize();
  if (cyTable) cyTable.resize();
  //if (cyRecord) cyRecord.resize?.();
});

window.addEventListener("mouseup", () => {
  isDraggingQuery = false;
  document.body.style.cursor = "default";
});


// =====================
// HORIZONTAL GRAPH DIVIDERS (VERTICAL SPLIT)
// =====================
const cyMainDiv = document.getElementById('cy-main');
const cyTableDiv = document.getElementById('cy-table');
const cyRecordDiv = document.getElementById('cy-record');
const divider1 = document.getElementById('divider1');
const divider2 = document.getElementById('divider2');

function makeVerticalDividerAll(divider) {
  let isDragging = false;

  divider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    document.body.style.cursor = "col-resize";
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.cursor = "default";
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const container = divider.parentElement;
    const containerRect = container.getBoundingClientRect();
    const totalWidth = containerRect.width - divider1.offsetWidth - divider2.offsetWidth;
    const minWidth = 100;

    let leftWidth = cyMainDiv.offsetWidth;
    let midWidth = cyTableDiv.offsetWidth;
    let rightWidth = cyRecordDiv.offsetWidth;

    if (divider === divider1) {
      // Dragging divider1 between cyMain and cyTable
      const x = e.clientX - containerRect.left;
      leftWidth = Math.max(minWidth, Math.min(x, totalWidth - minWidth * 2));
      midWidth = Math.max(minWidth, totalWidth - leftWidth - rightWidth);
    } else if (divider === divider2) {
      // Dragging divider2 between cyTable and cyRecord
      const x = e.clientX - containerRect.left;
      const leftActual = cyMainDiv.offsetWidth;
      midWidth = Math.max(minWidth, Math.min(x - leftActual - divider1.offsetWidth, totalWidth - minWidth * 2));
      rightWidth = Math.max(minWidth, totalWidth - leftActual - midWidth);
    }

    cyMainDiv.style.flex = `0 0 ${leftWidth}px`;
    cyTableDiv.style.flex = `0 0 ${midWidth}px`;
    cyRecordDiv.style.flex = `0 0 ${rightWidth}px`;

    if (cy) cy.resize();
    if (cyTable) cyTable.resize();
    //if (cyRecord) cyRecord.resize?.();
  });
}

makeVerticalDividerAll(divider1);
makeVerticalDividerAll(divider2);


// =====================
// AUTO FIT GRAPH AREA TO WINDOW
// =====================
function resizeGraphAreaToFitWindow() {
  const headerHeight = document.querySelector("header")?.offsetHeight || 0;
  const queryPanelHeight = queryPanel.offsetHeight || 0;
  const windowHeight = window.innerHeight;

  const availableHeight = windowHeight - headerHeight - queryPanelHeight - 20; // padding
  graphArea.style.height = `${availableHeight}px`;

  if (cy) cy.resize();
  if (cyTable) cyTable.resize();
  //if (cyRecord) cyRecord.resize?.();
}

window.addEventListener("resize", resizeGraphAreaToFitWindow);
window.addEventListener("load", resizeGraphAreaToFitWindow);





