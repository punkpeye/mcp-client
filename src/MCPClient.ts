import {
  Client,
  ClientOptions,
} from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  Implementation,
  Progress,
  ProgressNotificationSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import EventEmitter from "events";
import { z } from "zod";
import { StrictEventEmitter } from "strict-event-emitter-types";

/**
 * Callback for progress notifications.
 */
type ProgressCallback = (progress: Progress) => void;

type RequestOptions = {
  /**
   * If set, requests progress notifications from the remote end (if supported). When progress notifications are received, this callback will be invoked.
   */
  onProgress?: ProgressCallback;
  /**
   * Can be used to cancel an in-flight request. This will cause an AbortError to be raised from request().
   */
  signal?: AbortSignal;
  /**
   * A timeout (in milliseconds) for this request. If exceeded, an McpError with code `RequestTimeout` will be raised from request().
   *
   * If not specified, `DEFAULT_REQUEST_TIMEOUT_MSEC` will be used as the timeout.
   */
  timeout?: number;
};

type ProgressNotification = {
  progressToken: string | number;
  progress: number;
  total?: number | undefined;
  type: "progress";
};

type MCPClientEvents = {
  notification: (event: ProgressNotification) => void;
};

const MCPClientEventEmitterBase: {
  new (): StrictEventEmitter<EventEmitter, MCPClientEvents>;
} = EventEmitter;

class MCPClientEventEmitter extends MCPClientEventEmitterBase {}

export class MCPClient extends MCPClientEventEmitter {
  private client: Client;
  private transports: SSEClientTransport[] = [];

  constructor(clientInfo: Implementation, options?: ClientOptions) {
    super();

    this.client = new Client(clientInfo, options);

    this.client.setNotificationHandler(
      ProgressNotificationSchema,
      ({ params }) => {
        this.emit("notification", {
          progressToken: params.progressToken,
          progress: params.progress,
          total: params.total,
          type: "progress",
        });
      },
    );
  }

  async connect({ sseUrl }: { sseUrl: string }): Promise<SSEClientTransport> {
    const transport = new SSEClientTransport(new URL(sseUrl));

    this.transports.push(transport);

    await this.client.connect(transport);

    return transport;
  }

  async ping(options?: { requestOptions?: RequestOptions }): Promise<null> {
    await this.client.ping(options?.requestOptions);

    return null;
  }

  async callTool<
    TResultSchema extends z.ZodType = z.ZodType<CallToolResult>,
    TResult = z.infer<TResultSchema>,
  >(
    invocation: {
      name: string;
      arguments?: Record<string, unknown>;
    },
    options?: {
      resultSchema?: TResultSchema;
      requestOptions?: RequestOptions;
    },
  ): Promise<TResult> {
    return (await this.client.callTool(
      invocation,
      options?.resultSchema as any,
      options?.requestOptions,
    )) as TResult;
  }

  async close() {
    for (const transport of this.transports) {
      await transport.close();
    }
  }
}
