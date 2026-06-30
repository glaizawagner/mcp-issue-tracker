import { FastifyRequest, FastifyReply } from "fastify";
import { auth } from "./auth.js";
import { verifyApiKey } from "./apiKey.js";
import { getDatabase } from "./db/database.js";

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

function convertHeaders(requestHeaders: FastifyRequest["headers"]): Headers {
  const headers = new Headers();
  Object.entries(requestHeaders).forEach(([key, value]) => {
    if (value) {
      const headerValue = Array.isArray(value) ? value[0] : value;
      if (typeof headerValue === "string") {
        headers.append(key, headerValue);
      }
    }
  });
  return headers;
}

export async function authMiddleware(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    const apiKeyHeader = request.headers["x-api-key"];
    const apiKeyValue = Array.isArray(apiKeyHeader)
      ? apiKeyHeader[0]
      : apiKeyHeader;

    if (apiKeyValue) {
      const result = verifyApiKey(apiKeyValue);

      if (!result) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "Invalid API key",
        });
      }

      const db = getDatabase();
      const userRow = db.get("SELECT * FROM user WHERE id = ?", [
        result.userId,
      ]);

      if (!userRow) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "Invalid API key",
        });
      }

      request.user = {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        emailVerified: !!userRow.emailVerified,
        image: userRow.image ?? null,
        createdAt: userRow.createdAt,
        updatedAt: userRow.updatedAt,
      };

      return;
    }

    const headers = convertHeaders(request.headers);

    // Get session from BetterAuth
    const session = await auth.api.getSession({
      headers: headers,
    });

    if (!session?.user) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    // Attach user to request
    request.user = {
      ...session.user,
      image: session.user.image ?? null,
    };
  } catch (error) {
    console.error("Auth middleware error:", error);
    return reply.status(401).send({
      error: "Unauthorized",
      message: "Invalid authentication",
    });
  }
}

// Optional auth middleware (doesn't fail if no auth)
export async function optionalAuthMiddleware(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    const headers = convertHeaders(request.headers);

    // Get session from BetterAuth
    const session = await auth.api.getSession({
      headers: headers,
    });

    if (session?.user) {
      request.user = {
        ...session.user,
        image: session.user.image ?? null,
      };
    }
  } catch (error) {
    // Silently fail for optional auth
    console.debug("Optional auth failed:", error);
  }
}
