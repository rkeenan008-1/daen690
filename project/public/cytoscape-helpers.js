// Helper: disable browser context menu for any Cytoscape instance
export function disableRightClick(cyInstance) {
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

// Helper: save Cytoscape graph as image (png, jpg, svg)
export function saveGraphAsImage(cy, format = "png") {
  let data;
  let filename = `graph.${format}`;

  if (format === "png") {
    data = cy.png({ full: true });
  } else if (format === "jpg") {
    data = cy.jpg({ full: true, quality: 0.9 });
  } else if (format === "svg") {
    const svgContent = cy.svg({ full: true });
    data = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgContent);
  } else {
    throw new Error("Unsupported format: " + format);
  }

  const link = document.createElement("a");
  link.download = filename;
  link.href = data;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
