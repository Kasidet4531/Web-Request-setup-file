import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <>
      <header style={{ padding: '1rem', borderBottom: '1px solid #ccc' }}>
        <nav style={{ display: 'flex', gap: '1rem' }}>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/requests">PSF Requests</Link>
          <Link to="/history">History</Link>
          <Link to="/admin">Admin</Link>
          <Link to="/login">Login</Link>
        </nav>
      </header>
      <main style={{ padding: '1rem' }}>
        <Outlet />
      </main>
    </>
  ),
})
