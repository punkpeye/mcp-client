import { Client, ClientOptions } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Implementation, Progress } from "@modelcontextprotocol/sdk/types.js";

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

export class MCPClient {
  private client: Client;

  constructor(clientInfo: Implementation, options?: ClientOptions) {
    this.client = new Client(clientInfo, options);
  }

  async connect({
    sseUrl,
  }: {
    sseUrl: string;
  }): Promise<SSEClientTransport> {
    const transport = new SSEClientTransport(
      new URL(sseUrl),
    );

    await this.client.connect(transport);

    return transport;
  }

  async ping(options?: RequestOptions) {
    await this.client.ping(options);

    return null;
  }
}
