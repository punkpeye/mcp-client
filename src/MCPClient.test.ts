import { MCPClient, ErrorCode, McpError } from "./MCPClient.js";
import { z } from "zod";
import { test, expect, expectTypeOf, vi } from "vitest";
import { getRandomPort } from "get-port-please";
import { FastMCP, FastMCPSession } from "fastmcp";
import { setTimeout as delay } from "timers/promises";

const runWithTestServer = async ({
  run,
  client: createClient,
  server: createServer,
}: {
  server?: () => Promise<FastMCP>;
  client?: () => Promise<MCPClient>;
  run: ({
    server,
    client,
    session,
  }: {
    server: FastMCP;
    client: MCPClient;
    session: FastMCPSession;
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
    const client = createClient
      ? await createClient()
      : new MCPClient(
          {
            name: "example-client",
            version: "1.0.0",
          },
          {
            capabilities: {},
          },
        );

      const [session] = await Promise.all([
        new Promise<FastMCPSession>((resolve) => {
          server.on("connect", (event) => {
            
            resolve(event.session);
          });
        }),
        client.connect({ sseUrl }),
      ]);

    await run({ server, client, session });
  } finally {
    await server.stop();
  }

  return port;
};

test("closes a connection", async () => {
  await runWithTestServer({
    run: async ({ client }) => {
      await client.close();
    },
  });
});

test("pings a server", async () => {
  await runWithTestServer({
    run: async ({ client }) => {
      await expect(client.ping()).resolves.toBeNull();
    },
  });
});

test("gets tools", async () => {
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
    run: async ({ client }) => {
      const tools = await client.getTools();

      expect(tools).toEqual([
        {
          description: "Add two numbers",
          inputSchema: {
            $schema: "http://json-schema.org/draft-07/schema#",
            additionalProperties: false,
            properties: {
              a: {
                type: "number",
              },
              b: {
                type: "number",
              },
            },
            required: ["a", "b"],
            type: "object",
          },
          name: "add",
        },
      ]);
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
    run: async ({ client }) => {
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
    run: async ({ client }) => {
      const result = await client.callTool(
        {
          name: "add",
          arguments: {
            a: 1,
            b: 2,
          },
        },
        {
          resultSchema: z.object({
            content: z.array(
              z.object({
                type: z.literal("text"),
                text: z.string(),
              }),
            ),
          }),
        },
      );

      expectTypeOf(result).toEqualTypeOf<{
        content: { type: "text"; text: string }[];
      }>();
    },
  });
});

test("handles errors", async () => {
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
        execute: async () => {
          throw new Error("Something went wrong");
        },
      });

      return server;
    },
    run: async ({ client }) => {
      expect(
        await client.callTool({
          name: "add",
          arguments: {
            a: 1,
            b: 2,
          },
        }),
      ).toEqual({
        content: [{ type: "text", text: expect.stringContaining("Something went wrong") }],
        isError: true,
      });
    },
  });
});

test("calling an unknown tool throws McpError with MethodNotFound code", async () => {
  await runWithTestServer({
    server: async () => {
      const server = new FastMCP({
        name: "Test",
        version: "1.0.0",
      });

      return server;
    },
    run: async ({ client }) => {
      try {
        await client.callTool({
          name: "add",
          arguments: {
            a: 1,
            b: 2,
          },
        });
      } catch (error) {
        console.log(error);

        expect(error).toBeInstanceOf(McpError);

        // @ts-expect-error - we know that error is an McpError
        expect(error.code).toBe(ErrorCode.MethodNotFound);
      }
    },
  });
});

test("tracks tool progress", async () => {
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
        execute: async (args, { reportProgress }) => {
          reportProgress({
            progress: 0,
            total: 10,
          });

          await delay(100);

          return String(args.a + args.b);
        },
      });

      return server;
    },
    run: async ({ client }) => {
      const onProgress = vi.fn();

      await client.callTool(
        {
          name: "add",
          arguments: {
            a: 1,
            b: 2,
          },
        },
        {
          requestOptions: {
            onProgress,
          },
        },
      );

      expect(onProgress).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledWith({
        progress: 0,
        total: 10,
      });
    },
  });
});

test("sets logging levels", async () => {
  await runWithTestServer({
    run: async ({ client, session }) => {
      await client.setLoggingLevel("debug");

      expect(session.loggingLevel).toBe("debug");

      await client.setLoggingLevel("info");

      expect(session.loggingLevel).toBe("info");
    },
  });
});