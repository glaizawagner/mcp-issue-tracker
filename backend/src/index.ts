import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { auth } from "./auth.js";
import { generateApiKey } from "./apiKey.js";
import usersRoute from "./routes/users.js";
import tagsRoute from "./routes/tags.js";
import issuesRoute from "./routes/issues.js";
import { errorHandler } from "./middleware/errorHandler.js";
import {
  healthCheckHandler,
  readinessCheckHandler,
  livenessCheckHandler,
} from "./utils/health.js";

export async function buildApp(
  options = { skipAuth: false }
): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  // Add skipAuth flag to app context for routes to check
  (fastify as any).skipAuth = options.skipAuth;

  // Register error handler first
  fastify.setErrorHandler(errorHandler);

  // Register CORS
  await fastify.register(cors, {
    origin: ["http://localhost:5173", "http://localhost:5174"], // Vite dev server
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  });

  // Register BetterAuth routes with custom sign-up handling
  fastify.register(
    async function (fastify) {
      // Custom sign-up endpoint that forwards to Better Auth
      fastify.post("/sign-up/email", async (request, reply) => {
        try {
          // First, create the user through Better Auth
          const authRequest = new Request(
            `http://localhost:3000/api/auth/sign-up/email`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify(request.body),
            }
          );

          const authResponse = await auth.handler(authRequest);
          const responseText = await authResponse.text();

          // Forward Better Auth response as-is
          reply.status(authResponse.status);
          authResponse.headers.forEach((value, key) => {
            reply.header(key, value);
          });
          reply.send(responseText);
        } catch (error) {
          console.error("Custom sign-up error:", error);
          reply.status(500).send({
            error: "Sign-up error",
            code: "SIGNUP_ERROR",
            details: error instanceof Error ? error.message : "Unknown error",
          });
        }
      });

      // Issue a new API key for the currently signed-in user (session cookie required)
      fastify.post("/generate-api-key", async (request, reply) => {
        const headers = new Headers();
        Object.entries(request.headers).forEach(([key, value]) => {
          if (value) {
            const headerValue = Array.isArray(value) ? value[0] : value;
            if (typeof headerValue === "string") {
              headers.set(key, headerValue);
            }
          }
        });

        const session = await auth.api.getSession({ headers });

        if (!session?.user) {
          return reply.status(401).send({
            error: "Unauthorized",
            message: "Authentication required",
          });
        }

        const name =
          (request.body as { name?: string } | undefined)?.name ?? undefined;
        const result = generateApiKey(session.user.id, name);

        reply.send({ success: true, apiKey: result });
      });

      // Handle all other auth routes normally
      fastify.all("/*", async (request, reply) => {
        try {
          // Construct the full URL
          const testUrl = `http://localhost:3000${request.url}`;

          // Convert Fastify headers to Headers object
          const headers = new Headers();
          Object.entries(request.headers).forEach(([key, value]) => {
            if (value) {
              const headerValue = Array.isArray(value) ? value[0] : value;
              if (typeof headerValue === "string") {
                headers.set(key, headerValue);
              }
            }
          });

          // Ensure content-type is set for POST requests
          if (request.method === "POST" && !headers.has("content-type")) {
            headers.set("content-type", "application/json");
          }

          // Create the request object for BetterAuth
          const authRequest = new Request(testUrl, {
            method: request.method,
            headers: headers,
            body:
              request.method !== "GET" && request.method !== "HEAD"
                ? JSON.stringify(request.body)
                : null,
          });

          // Call BetterAuth handler
          const authResponse = await auth.handler(authRequest);

          // Get response text
          const responseText = await authResponse.text();

          // Set status
          reply.status(authResponse.status);

          // Copy all headers from auth response
          authResponse.headers.forEach((value, key) => {
            reply.header(key, value);
          });

          // Send response
          reply.send(responseText);
        } catch (error) {
          console.error("Auth error:", error);
          reply.status(500).send({
            error: "Authentication error",
            code: "AUTH_ERROR",
            details: error instanceof Error ? error.message : "Unknown error",
          });
        }
      });
    },
    { prefix: "/api/auth" }
  );

  // Test route
  fastify.get("/", async function handler(request, reply) {
    return { hello: "world" };
  });

  // Register API routes
  fastify.register(async function (fastify) {
    fastify.register(usersRoute, { prefix: "/api/users" });
    fastify.register(tagsRoute, { prefix: "/api/tags" });
    fastify.register(issuesRoute, { prefix: "/api/issues" });
  });

  // Health check endpoints (no rate limiting)
  fastify.get("/health", healthCheckHandler);
  fastify.get("/health/ready", readinessCheckHandler);
  fastify.get("/health/live", livenessCheckHandler);

  // Legacy health check for backward compatibility
  fastify.get("/api/health", async function handler(request, reply) {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  return fastify;
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const app = await buildApp();
    await app.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
