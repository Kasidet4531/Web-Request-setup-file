/** Throwaway preview server. Every /api call is handled here; no real API or database is contacted. */
import { mergeConfig, type Plugin } from 'vite'
import base from './vite.config'
import { snapshotPrototypeFixture as snapshot, snapshotPrototypeRequest, snapshotPrototypeStatusFixture } from './src/components/RequestSnapshotPrototype.fixture'

const sampleApi: Plugin = {
  name: 'snapshot-prototype-sample-api',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = req.url?.split('?')[0]
      if (!path?.startsWith('/api/')) return next()
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      if (req.method !== 'GET') { res.statusCode = 405; res.end(JSON.stringify({ message: 'This design preview is read only.' })); return }
      const responses: Record<string, unknown> = {
        '/api/me': { user: { id: 'sample-user', username: 'sample-requester', displayName: 'Sample Requester', role: 'requester', setupOwnerDepartment: null } },
        '/api/requests/prototype/history/entry-1': snapshot,
        '/api/requests/prototype/history/status-1': snapshotPrototypeStatusFixture,
        '/api/requests/prototype/history': [snapshotPrototypeStatusFixture.entry, snapshot.entry],
        '/api/requests/prototype': snapshotPrototypeRequest,
        '/api/requests/prototype/status-options': { statuses: [], currentStatus: snapshot.currentStatus },
      }
      if (Object.hasOwn(responses, path)) { res.end(JSON.stringify(responses[path])); return }
      res.statusCode = 404
      res.end(JSON.stringify({ message: 'This preview contains only the sample Request Snapshot. Open /requests/prototype/history/entry-1?variant=A.' }))
    })
  },
}

export default mergeConfig(base, {
  plugins: [sampleApi],
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api') },
  server: { host: '0.0.0.0', port: 5174, strictPort: true },
})
