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
      client.connect({ url: sseUrl, type: "sse" }),
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
      const tools = await client.getAllTools();

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
        content: [
          {
            type: "text",
            text: expect.stringContaining("Something went wrong"),
          },
        ],
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

test("sends logging messages to the client", async () => {
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
        execute: async (args, { log }) => {
          log.debug("debug message", {
            foo: "bar",
          });
          log.error("error message");
          log.info("info message");
          log.warn("warn message");

          return String(args.a + args.b);
        },
      });

      return server;
    },
    run: async ({ client }) => {
      const onLog = vi.fn();

      client.on("loggingMessage", onLog);

      await client.callTool({
        name: "add",
        arguments: {
          a: 1,
          b: 2,
        },
      });

      expect(onLog).toHaveBeenCalledTimes(4);
      expect(onLog).toHaveBeenNthCalledWith(1, {
        level: "debug",
        message: "debug message",
        context: {
          foo: "bar",
        },
      });
      expect(onLog).toHaveBeenNthCalledWith(2, {
        level: "error",
        message: "error message",
      });
      expect(onLog).toHaveBeenNthCalledWith(3, {
        level: "info",
        message: "info message",
      });
      expect(onLog).toHaveBeenNthCalledWith(4, {
        level: "warning",
        message: "warn message",
      });
    },
  });
});

test("adds resources", async () => {
  await runWithTestServer({
    server: async () => {
      const server = new FastMCP({
        name: "Test",
        version: "1.0.0",
      });

      server.addResource({
        uri: "file:///logs/app.log",
        name: "Application Logs",
        mimeType: "text/plain",
        async load() {
          return {
            text: "Example log content",
          };
        },
      });

      return server;
    },
    run: async ({ client }) => {
      expect(await client.getAllResources()).toEqual([
        {
          uri: "file:///logs/app.log",
          name: "Application Logs",
          mimeType: "text/plain",
        },
      ]);
    },
  });
});

test("clients reads a resource", async () => {
  await runWithTestServer({
    server: async () => {
      const server = new FastMCP({
        name: "Test",
        version: "1.0.0",
      });

      server.addResource({
        uri: "file:///logs/app.log",
        name: "Application Logs",
        mimeType: "text/plain",
        async load() {
          return {
            text: "Example log content",
          };
        },
      });

      return server;
    },
    run: async ({ client }) => {
      expect(
        await client.getResource({
          uri: "file:///logs/app.log",
        }),
      ).toEqual({
        contents: [
          {
            uri: "file:///logs/app.log",
            name: "Application Logs",
            text: "Example log content",
            mimeType: "text/plain",
          },
        ],
      });
    },
  });
});

test("clients reads a resource that returns multiple resources", async () => {
  await runWithTestServer({
    server: async () => {
      const server = new FastMCP({
        name: "Test",
        version: "1.0.0",
      });

      server.addResource({
        uri: "file:///logs/app.log",
        name: "Application Logs",
        mimeType: "text/plain",
        async load() {
          return [
            {
              text: "a",
            },
            {
              text: "b",
            },
          ];
        },
      });

      return server;
    },
    run: async ({ client }) => {
      expect(
        await client.getResource({
          uri: "file:///logs/app.log",
        }),
      ).toEqual({
        contents: [
          {
            uri: "file:///logs/app.log",
            name: "Application Logs",
            text: "a",
            mimeType: "text/plain",
          },
          {
            uri: "file:///logs/app.log",
            name: "Application Logs",
            text: "b",
            mimeType: "text/plain",
          },
        ],
      });
    },
  });
});

test("adds prompts", async () => {
  await runWithTestServer({
    server: async () => {
      const server = new FastMCP({
        name: "Test",
        version: "1.0.0",
      });

      server.addPrompt({
        name: "git-commit",
        description: "Generate a Git commit message",
        arguments: [
          {
            name: "changes",
            description: "Git diff or description of changes",
            required: true,
          },
        ],
        load: async (args) => {
          return `Generate a concise but descriptive commit message for these changes:\n\n${args.changes}`;
        },
      });

      return server;
    },
    run: async ({ client }) => {
      expect(
        await client.getPrompt({
          name: "git-commit",
          arguments: {
            changes: "foo",
          },
        }),
      ).toEqual({
        description: "Generate a Git commit message",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Generate a concise but descriptive commit message for these changes:\n\nfoo",
            },
          },
        ],
      });

      expect(await client.getAllPrompts()).toEqual([
        {
          name: "git-commit",
          description: "Generate a Git commit message",
          arguments: [
            {
              name: "changes",
              description: "Git diff or description of changes",
              required: true,
            },
          ],
        },
      ]);
    },
  });
});

test("completes prompt arguments", async () => {
  await runWithTestServer({
    server: async () => {
      const server = new FastMCP({
        name: "Test",
        version: "1.0.0",
      });

      server.addPrompt({
        name: "countryPoem",
        description: "Writes a poem about a country",
        load: async ({ name }) => {
          return `Hello, ${name}!`;
        },
        arguments: [
          {
            name: "name",
            description: "Name of the country",
            required: true,
            complete: async (value) => {
              if (value === "Germ") {
                return {
                  values: ["Germany"],
                };
              }

              return {
                values: [],
              };
            },
          },
        ],
      });

      return server;
    },
    run: async ({ client }) => {
      const response = await client.complete({
        ref: {
          type: "ref/prompt",
          name: "countryPoem",
        },
        argument: {
          name: "name",
          value: "Germ",
        },
      });

      expect(response).toEqual({
        completion: {
          values: ["Germany"],
        },
      });
    },
  });
});

test("lists resource templates", async () => {
  await runWithTestServer({
    server: async () => {
      const server = new FastMCP({
        name: "Test",
        version: "1.0.0",
      });

      server.addResourceTemplate({
        uriTemplate: "file:///logs/{name}.log",
        name: "Application Logs",
        mimeType: "text/plain",
        arguments: [
          {
            name: "name",
            description: "Name of the log",
            required: true,
          },
        ],
        load: async ({ name }) => {
          return {
            text: `Example log content for ${name}`,
          };
        },
      });

      return server;
    },
    run: async ({ client }) => {
      expect(await client.getAllResourceTemplates()).toEqual([
        {
          name: "Application Logs",
          uriTemplate: "file:///logs/{name}.log",
        },
      ]);
    },
  });
});
