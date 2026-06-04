import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape'

import type { GraphResponse } from './api'

export interface GraphViewHandle {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  reset: () => void
}

interface GraphViewProps {
  graph: GraphResponse | null
  showEdgeLabels: boolean
  selectedNodeId: string | null
  onNodeSelect: (nodeId: string) => void
}

interface MiniNode {
  id: string
  type: string
  x: number
  y: number
}

const MINIMAP_ENABLED = false

export const GraphView = forwardRef<GraphViewHandle, GraphViewProps>(function GraphView(
  { graph, showEdgeLabels, selectedNodeId, onNodeSelect },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<Core | null>(null)
  const [miniNodes, setMiniNodes] = useState<MiniNode[]>([])

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

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      const cy = cyRef.current
      if (!cy) return
      cy.zoom({ level: Math.min(cy.maxZoom(), cy.zoom() * 1.18), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
    },
    zoomOut: () => {
      const cy = cyRef.current
      if (!cy) return
      cy.zoom({ level: Math.max(cy.minZoom(), cy.zoom() / 1.18), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
    },
    fit: () => {
      cyRef.current?.fit(undefined, 64)
    },
    reset: () => {
      const cy = cyRef.current
      if (!cy) return
      cy.layout({ name: cy.elements().length > 24 ? 'cose' : 'breadthfirst', animate: false, fit: true, padding: 80 }).run()
    },
  }))

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    cyRef.current?.destroy()
    setMiniNodes([])

    if (!graph || graph.nodes.length === 0) {
      cyRef.current = null
      return
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      minZoom: 0.3,
      maxZoom: 2.8,
      wheelSensitivity: 0.16,
      autoungrabify: false,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            width: 42,
            height: 42,
            color: '#f8fafc',
            'font-size': 12,
            'font-weight': 700,
            'text-outline-color': '#020617',
            'text-outline-width': 3,
            'text-margin-y': 10,
            'border-color': '#1f3b59',
            'border-width': 2,
            'background-color': '#475569',
            'overlay-opacity': 0,
          },
        },
        {
          selector: 'node[type = "anime"]',
          style: {
            shape: 'round-rectangle',
            width: 118,
            height: 54,
            'background-color': '#0b4ea2',
            'border-color': '#1688ff',
            'border-width': 2,
          },
        },
        {
          selector: 'node[type = "staff"]',
          style: {
            shape: 'ellipse',
            width: 52,
            height: 52,
            'background-color': '#e66b00',
            'border-color': '#ffb03a',
            'border-width': 2,
          },
        },
        {
          selector: 'node[type = "studio"]',
          style: {
            shape: 'hexagon',
            width: 76,
            height: 62,
            'background-color': '#2e8a3c',
            'border-color': '#73d37a',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 'mapData(weight, 1, 6, 1.4, 4)',
            label: showEdgeLabels ? 'data(label)' : '',
            color: '#dbeafe',
            'font-size': 9,
            'line-color': '#9ca3af',
            'line-opacity': 0.72,
            'curve-style': 'bezier',
            'text-rotation': 'autorotate',
            'text-outline-color': '#020617',
            'text-outline-width': 3,
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#9ca3af',
            'arrow-scale': 0.7,
          },
        },
        {
          selector: 'edge[type = "studio"]',
          style: {
            'line-style': 'dashed',
            'line-color': '#a3a3a3',
            'target-arrow-shape': 'none',
          },
        },
        {
          selector: '.highlighted',
          style: {
            'border-color': '#ffd400',
            'border-width': 4,
            'line-color': '#ffd400',
            'target-arrow-color': '#ffd400',
            'line-opacity': 1,
            width: 5,
            'z-index': 20,
          },
        },
        {
          selector: '.selected',
          style: {
            'border-color': '#ffffff',
            'border-width': 4,
          },
        },
      ],
      layout: {
        name: elements.length > 24 ? 'cose' : 'breadthfirst',
        animate: false,
        fit: true,
        padding: 80,
      },
    })

    const updateMiniMap = () => {
      const nodes = cy.nodes().map((node) => {
        const position = node.position()
        return {
          id: node.id(),
          type: String(node.data('type') ?? ''),
          x: position.x,
          y: position.y,
        }
      })
      setMiniNodes(nodes)
    }

    cy.on('tap', 'node', (event) => {
      onNodeSelect(event.target.id())
    })
    if (MINIMAP_ENABLED) {
      cy.on('layoutstop position viewport', updateMiniMap)
      window.requestAnimationFrame(updateMiniMap)
    }

    cyRef.current = cy
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [elements, graph, onNodeSelect, showEdgeLabels])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) {
      return
    }
    cy.nodes().removeClass('selected')
    if (selectedNodeId) {
      cy.getElementById(selectedNodeId).addClass('selected')
    }
  }, [selectedNodeId])

  if (!graph) {
    return <div className="graph-empty">Choose two anime from search to build a creative graph.</div>
  }

  if (graph.nodes.length === 0) {
    return <div className="graph-empty">No graph data is available for this pair under the active filters.</div>
  }

  return (
    <div className="graph-stage">
      <div ref={containerRef} className="graph-canvas" />
      {MINIMAP_ENABLED ? <MiniMap nodes={miniNodes} selectedNodeId={selectedNodeId} /> : null}
    </div>
  )
})

function MiniMap({ nodes, selectedNodeId }: { nodes: MiniNode[]; selectedNodeId: string | null }) {
  if (nodes.length === 0) {
    return null
  }

  const minX = Math.min(...nodes.map((node) => node.x))
  const maxX = Math.max(...nodes.map((node) => node.x))
  const minY = Math.min(...nodes.map((node) => node.y))
  const maxY = Math.max(...nodes.map((node) => node.y))
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)

  return (
    <div className="minimap" aria-hidden="true">
      <svg viewBox="0 0 180 110" role="presentation">
        {nodes.map((node) => {
          const x = 10 + ((node.x - minX) / width) * 160
          const y = 10 + ((node.y - minY) / height) * 90
          const fill = node.type === 'anime' ? '#1688ff' : node.type === 'staff' ? '#ff7a00' : '#4caf50'
          return <circle key={node.id} cx={x} cy={y} r={node.id === selectedNodeId ? 4 : 2.5} fill={fill} opacity={node.id === selectedNodeId ? 1 : 0.78} />
        })}
      </svg>
    </div>
  )
}
