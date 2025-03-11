import { MCPClient } from "./MCPClient.js";
import { z } from "zod";
import { test, expect } from "vitest";
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

      await expect(client.ping()).resolves.toBeNull();
    },
  });
});