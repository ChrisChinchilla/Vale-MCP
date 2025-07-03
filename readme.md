# Vale MCP Server

> Very early days.

1. You need Vale installed and in your PATH.
2. Clone the repo.
3. Install dependencies with `npm install`.
4. [Follow these instructions](https://modelcontextprotocol.io/quickstart/server#testing-your-server-with-claude-for-desktop).

And you should receive responses based on the current style guide rules that Vale sees relative to your path. That's about it for now…

For development, much the same as above, but to test changes, run `npm run build` to compile the TypeScript, then reload Claude (or whatever client you are using) to pick up the changes.