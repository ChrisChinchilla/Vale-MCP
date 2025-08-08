# Vale MCP Server

> BETA: Very early days.

1. You need Vale installed and in your PATH.
2. Clone the repo.
3. Install dependencies with `npm install`.
4. Rebuild with `npm run build`.
5. [Follow these instructions](https://modelcontextprotocol.io/quickstart/server#testing-your-server-with-claude-for-desktop) to add the full location of _build/index.js_.

Depending on the tool you use, you can ask variants of "Vale rewrite this text 'text'" or "Use Vale style-text to rewrite this text 'text'". If you use the MCP server in an editor using an AI chat interface and agentic mode, you should be able to rewrite the content of text files.

Be warned that Vale itself does not use AI, so it doesn't always give applicable responses, depending on your configuration and how much you trust it.

All the usual Vale rules apply, the server runs system-wide Vale and your system-wide Vale configuration. In the future I plan to add overrides to this.

[![Screenshot of Vale MCP server](https://img.youtube.com/vi/sbJ51s7ZUC8/0.jpg)](https://www.youtube.com/watch?v=sbJ51s7ZUC8)


For development, much the same as above, but to test changes, run `npm run build` to compile the TypeScript, then reload Claude (or whatever client you are using) to pick up the changes.
