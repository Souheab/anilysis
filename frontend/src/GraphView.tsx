import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import cytoscape, { type Core, type ElementDefinition, type LayoutOptions } from 'cytoscape'
import cola from 'cytoscape-cola'
import fcose from 'cytoscape-fcose'

import type { GraphResponse } from './api'

cytoscape.use(cola)
cytoscape.use(fcose)

export type GraphLayout = 'fcose' | 'cola' | 'breadthfirst'

export interface GraphViewHandle {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  reset: () => void
}

interface GraphViewProps {
  graph: GraphResponse | null
  graphLayout: GraphLayout
  showEdgeLabels: boolean
  wheelSensitivity: number
  selectedNodeId: string | null
  selectedEdgeId: string | null
  onNodeSelect: (nodeId: string) => void
  onEdgeSelect: (edgeId: string) => void
}

interface MiniNode {
  id: string
  type: string
  x: number
  y: number
}

const MINIMAP_ENABLED = false
const STAFF_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><g fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="15" r="6"/><path d="M13 36c1.7-7.4 5.4-11 11-11s9.3 3.6 11 11"/></g></svg>',
)}`
const VOICE_ACTOR_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><g fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M19 13a5 5 0 0 1 10 0v8a5 5 0 0 1-10 0z"/><path d="M13 21c0 6 4 10 11 10s11-4 11-10"/><path d="M24 31v6"/><path d="M18 37h12"/></g></svg>',
)}`

function graphLayoutOptions(name: GraphLayout): LayoutOptions {
  return { name, animate: false, fit: true, padding: 80 } as LayoutOptions
}

export const GraphView = forwardRef<GraphViewHandle, GraphViewProps>(function GraphView(
  { graph, graphLayout, showEdgeLabels, wheelSensitivity, selectedNodeId, selectedEdgeId, onNodeSelect, onEdgeSelect },
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
      cy.layout(graphLayoutOptions(graphLayout)).run()
    },
  }), [graphLayout])

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
      wheelSensitivity,
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
            'text-outline-width': 1,
            'text-halign': 'center',
            'text-valign': 'center',
            'text-wrap': 'wrap',
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
            'text-max-width': '100px',
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
            'background-image': STAFF_ICON,
            'background-fit': 'none',
            'background-position-x': '50%',
            'background-position-y': '50%',
            'background-width': 52,
            'background-height': 52,
            'text-valign': 'bottom',
            'text-margin-y': 8,
            'text-max-width': '78px',
          },
        },
        {
          selector: 'node[type = "voiceActor"]',
          style: {
            shape: 'ellipse',
            width: 50,
            height: 50,
            'background-color': '#c026d3',
            'border-color': '#f0abfc',
            'border-width': 2,
            'background-image': VOICE_ACTOR_ICON,
            'background-fit': 'none',
            'background-position-x': '50%',
            'background-position-y': '50%',
            'background-width': 48,
            'background-height': 48,
            'text-valign': 'bottom',
            'text-margin-y': 8,
            'text-max-width': '78px',
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
            'text-max-width': '64px',
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
          selector: 'edge[type = "voice_actor"]',
          style: {
            'line-color': '#d946ef',
            'target-arrow-color': '#d946ef',
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-color': '#ffd400',
            'border-width': 4,
            'z-index': 20,
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            'line-color': '#ffd400',
            'target-arrow-color': '#ffd400',
            'line-opacity': 1,
            width: 5,
            'z-index': 20,
          },
        },
        {
          selector: 'node.selected',
          style: {
            'border-color': '#ffffff',
            'border-width': 4,
          },
        },
        {
          selector: 'edge.selected',
          style: {
            'line-color': '#ffffff',
            'target-arrow-color': '#ffffff',
            'line-opacity': 1,
            width: 5,
            'z-index': 25,
          },
        },
      ],
      layout: graphLayoutOptions(graphLayout),
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
    cy.on('tap', 'edge', (event) => {
      onEdgeSelect(event.target.id())
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
  }, [elements, graph, graphLayout, onEdgeSelect, onNodeSelect, showEdgeLabels, wheelSensitivity])

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

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) {
      return
    }
    cy.edges().removeClass('selected')
    if (selectedEdgeId) {
      cy.getElementById(selectedEdgeId).addClass('selected')
    }
  }, [selectedEdgeId])

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
          const fill = node.type === 'anime' ? '#1688ff' : node.type === 'staff' ? '#ff7a00' : node.type === 'voiceActor' ? '#d946ef' : '#4caf50'
          return <circle key={node.id} cx={x} cy={y} r={node.id === selectedNodeId ? 4 : 2.5} fill={fill} opacity={node.id === selectedNodeId ? 1 : 0.78} />
        })}
      </svg>
    </div>
  )
}
