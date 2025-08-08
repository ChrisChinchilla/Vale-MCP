import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
// Create server instance
const server = new McpServer({
    name: "vale",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {},
        logging: {},
    },
});
// TODO: Will data formatter help?
// Helper function for calling vale binary
async function callVale(binaryPath, args = []) {
    try {
        const result = await execFileAsync(binaryPath, args);
        return result.stdout;
    }
    catch (err) {
        console.error("Error calling binary or parsing JSON:", err);
        throw err;
    }
}
server.tool("style-text", "Lint text using Vale", {
    text: z.string().describe("Text to lint"),
}, async ({ text }) => {
    const args = ["--output=line", "--no-exit"];
    const result = await callVale("vale", [...args, `"${text}"`]);
    if (!result) {
        return {
            content: [
                {
                    type: "text",
                    text: result,
                },
            ],
        };
    }
    else {
        return {
            content: [
                {
                    type: "text",
                    text: result,
                },
            ],
        };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // TODO: Logging doesn't seem to work
    //   server.sendLoggingMessage({
    //   level: "info",
    //   data: "Server started successfully",
    // });
    console.error("Vale MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
