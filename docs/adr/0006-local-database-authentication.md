# 6. Local Database Authentication

We decided to use Local Database Authentication (Username/Password with Bcrypt hashing) for the MVP, rather than integrating corporate SSO or LDAP from the start, while keeping the database schema design adaptable to future authentication migrations.

## Context

The system requires authentication to enforce role-based access. Since this is an internal tool, corporate Single Sign-On (SSO) or LDAP are logical candidates. However, setting up SSO/LDAP integration requires configuring credentials, certificate trusts, and network routes with external corporate IT services, which introduces external dependencies and slows down initial development and local testing.

## Decision

We chose Local Database Authentication because:
- **Development Velocity**: It allows us to build the login flow, session management, and role configuration immediately without external dependencies.
- **Migration Path**: The user table will store basic fields (username, password hash, role, name, email). When we migrate to SSO (OAuth2/OIDC) or LDAP in the future, we can transition the login endpoint, store external identity provider keys in the user table, and disable local password verification.
- **Security**: Passwords will be securely hashed using Bcrypt on the backend and sessions will be managed via secure, HttpOnly, SameSite cookies.
