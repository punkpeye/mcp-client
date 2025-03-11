import { MCPClient } from "./MCPClient.js";
import { z } from "zod";
import { test, expect, expectTypeOf } from "vitest";
import { getRandomPort } from "get-port-please";
import { FastMCP } from "fastmcp";

const runWithTestServer = async ({
  run,
  server: createServer,
}: {
  server?: () => Promise<FastMCP>;
  run: ({
    server,
    sseUrl,
  }: {
    server: FastMCP;
    sseUrl: string;
  }) => Promise<void>;
}) => {
  const port = await getRandomPort();

  const server = createServer
    ? await createServer()
    : new FastMCP({
        name: "Test",
        version: "1.0.0",
      });

  await server.start({
    transportType: "sse",
    sse: {
      endpoint: "/sse",
      port,
    },
  });

  const sseUrl = `http://localhost:${port}/sse`;

  try {
    await run({ server, sseUrl });
  } finally {
    await server.stop();
  }

  return port;
};

test("closes a connection", async () => {
  await runWithTestServer({
    run: async ({ sseUrl }) => {
      const client = new MCPClient({
        name: "Test",
        version: "1.0.0",
      });

      await client.connect({ sseUrl });

      await client.close();
    },
  });
});

test("pings a server", async () => {
  await runWithTestServer({
    run: async ({ sseUrl }) => {
      const client = new MCPClient({
        name: "Test",
        version: "1.0.0",
      });

      await client.connect({ sseUrl });

      await expect(client.ping()).resolves.toBeNull();
    },
  });
});

test("calls a tool", async () => {
  await runWithTestServer({
    server: async () => {
      const server = new FastMCP({
        name: "Test",
        version: "1.0.0",
      });

      server.addTool({
        name: "add",
        description: "Add two numbers",
        parameters: z.object({
          a: z.number(),
          b: z.number(),
        }),
        execute: async (args) => {
          return String(args.a + args.b);
        },
      });

      return server;
    },
    run: async ({ sseUrl }) => {
      const client = new MCPClient({
        name: "Test",
        version: "1.0.0",
      });

      await client.connect({ sseUrl });

      await expect(
        client.callTool({
          name: "add",
          arguments: {
            a: 1,
            b: 2,
          },
        }),
      ).resolves.toEqual({
        content: [{ type: "text", text: "3" }],
      });
    },
  });
});

test("calls a tool with a custom result schema", async () => {
  await runWithTestServer({
    server: async () => {
      const server = new FastMCP({
        name: "Test",
        version: "1.0.0",
      });

      server.addTool({
        name: "add",
        description: "Add two numbers",
        parameters: z.object({
          a: z.number(),
          b: z.number(),
        }),
        execute: async (args) => {
          return String(args.a + args.b);
        },
      });

      return server;
    },
    run: async ({ sseUrl }) => {
      const client = new MCPClient({
        name: "Test",
        version: "1.0.0",
      });

      await client.connect({ sseUrl });

      const result = await client.callTool({
        name: "add",
        arguments: {
          a: 1,
          b: 2,
        },
      }, {
        resultSchema: z.object({
          content: z.array(z.object({
            type: z.literal("text"),
            text: z.string(),
          })),
          }),
        },
      );

      expectTypeOf(result).toEqualTypeOf<{
        content: { type: "text"; text: string }[];
      }>();
    },
  });
});

test("receives progress notifications", async () => {
  await runWithTestServer({
    server: async () => {
      const server = new FastMCP({
        name: "Test",
        version: "1.0.0",
      });

      return server;
    },
    run: async ({ sseUrl }) => {
      const client = new MCPClient({
        name: "Test",
        version: "1.0.0",
      });

      await client.connect({ sseUrl });
    },
  });
});
