import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from 'child_process';
import { promisify } from 'util';
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
// Helper function for calling vale binary
async function callVale(binaryPath, args = []) {
    try {
        const result = await execFileAsync(binaryPath, args);
        return result.stdout;
    }
    catch (err) {
        console.error('Error calling binary or parsing JSON:', err);
        throw err;
    }
}
// Format alert data
function formatAlert(feature) {
    const props = feature.properties;
    return [
        `Event: ${props.event || "Unknown"}`,
        `Area: ${props.areaDesc || "Unknown"}`,
        `Severity: ${props.severity || "Unknown"}`,
        `Status: ${props.status || "Unknown"}`,
        `Headline: ${props.headline || "No headline"}`,
        "---",
    ].join("\n");
}
// Register weather tools
// server.tool(
//   "get-alerts",
//   "Get weather alerts for a state",
//   {
//     state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
//   },
//   async ({ state }) => {
//     const stateCode = state.toUpperCase();
//     const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
//     const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);
//     if (!alertsData) {
//       return {
//         content: [
//           {
//             type: "text",
//             text: "Failed to retrieve alerts data",
//           },
//         ],
//       };
//     }
//     const features = alertsData.features || [];
//     if (features.length === 0) {
//       return {
//         content: [
//           {
//             type: "text",
//             text: `No active alerts for ${stateCode}`,
//           },
//         ],
//       };
//     }
//     const formattedAlerts = features.map(formatAlert);
//     const alertsText = `Active alerts for ${stateCode}:\n\n${formattedAlerts.join(
//       "\n"
//     )}`;
//     return {
//       content: [
//         {
//           type: "text",
//           text: alertsText,
//         },
//       ],
//     };
//   }
// );
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
// async function main() {
//   const transport = new StdioServerTransport();
// await server.connect(transport);
// //   server.sendLoggingMessage({
//     //   ],
//     // };
//     }
// );
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
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
