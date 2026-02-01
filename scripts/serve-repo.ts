// Simple HTTP server to serve the local repository for testing
// Usage: deno task serve-repo

const port = 8000;
const repoDir = "./repo";

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname === "/" ? "/index.json" : url.pathname;
  const filePath = `${repoDir}${path}`;

  try {
    const content = await Deno.readTextFile(filePath);
    const contentType = path.endsWith(".json")
      ? "application/json"
      : "text/plain";

    return new Response(content, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

console.log(`Serving repository at http://localhost:${port}`);
console.log("Use: e5 -u http://localhost:8000 <command>");
Deno.serve({ port }, handler);
