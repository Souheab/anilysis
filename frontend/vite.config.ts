import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'cytoscape', test: /node_modules\/cytoscape\/|node_modules\/cytoscape-[^/]+\/node_modules\/cytoscape\// },
            { name: 'graph-layouts', test: /node_modules\/(cytoscape-cola|cytoscape-fcose|webcola|layout-base|cose-base)\// },
          ],
        },
      },
    },
  },
})
