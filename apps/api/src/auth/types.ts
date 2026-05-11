// JWT token payload shape — used across auth service, middleware, and routes.

export interface JwtTokenPayload {
  userId:   string
  tenantId: string
  role:     string
  email:    string
  type:     'access' | 'refresh'
}

// Augment @fastify/jwt so req.user is typed correctly everywhere.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtTokenPayload
    user:    JwtTokenPayload
  }
}
