import { useEffect, useMemo, useRef } from 'react'
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape'

import type { GraphResponse } from './api'

interface GraphViewProps {
  graph: GraphResponse | null
  onNodeSelect: (nodeId: string) => void
}

export function GraphView({ graph, onNodeSelect }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<Core | null>(null)

  const elements = useMemo<ElementDefinition[]>(() => {
    if (!graph) {
      return []
    }
    return [
      ...graph.nodes.map((node) => ({
        data: node.data,
        classes: node.classes,
      })),
      ...graph.edges.map((edge) => ({
        data: edge.data,
        classes: edge.classes,
      })),
    ] as ElementDefinition[]
  }, [graph])

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    cyRef.current?.destroy()
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      minZoom: 0.35,
      maxZoom: 2.5,
      wheelSensitivity: 0.2,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            width: 34,
            height: 34,
            color: '#111827',
            'font-size': 10,
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.86,
            'text-background-padding': '3px',
            'text-margin-y': 8,
            'border-color': '#ffffff',
            'border-width': 2,
            'background-color': '#64748b',
          },
        },
        {
          selector: 'node[type = "anime"]',
          style: {
            shape: 'round-rectangle',
            width: 42,
            height: 54,
            'background-color': '#0f766e',
            'background-image': 'data(imageUrl)',
            'background-fit': 'cover',
          },
        },
        {
          selector: 'node[type = "staff"]',
          style: {
            shape: 'ellipse',
            'background-color': '#dc2626',
            'background-image': 'data(imageUrl)',
            'background-fit': 'cover',
          },
        },
        {
          selector: 'node[type = "studio"]',
          style: {
            shape: 'diamond',
            'background-color': '#d97706',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 'mapData(weight, 1, 6, 1.5, 5)',
            label: 'data(label)',
            color: '#475569',
            'font-size': 8,
            'line-color': '#94a3b8',
            'curve-style': 'bezier',
            'text-rotation': 'autorotate',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.75,
            'text-background-padding': '2px',
          },
        },
        {
          selector: '.highlighted',
          style: {
            'border-color': '#facc15',
            'border-width': 4,
            'line-color': '#facc15',
            'target-arrow-color': '#facc15',
            width: 5,
            'z-index': 10,
          },
        },
      ],
      layout: {
        name: elements.length > 20 ? 'cose' : 'breadthfirst',
        animate: false,
        fit: true,
        padding: 36,
      },
    })

    cy.on('tap', 'node', (event) => {
      onNodeSelect(event.target.id())
    })

    cyRef.current = cy
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [elements, onNodeSelect])

  if (!graph) {
    return (
      <div className="grid h-[520px] place-items-center border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        Select two anime and run a comparison.
      </div>
    )
  }

  if (graph.nodes.length === 0) {
    return (
      <div className="grid h-[520px] place-items-center border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        No graph data is available for this pair yet.
      </div>
    )
  }

  return <div ref={containerRef} className="h-[520px] w-full border border-slate-200 bg-white" />
}
