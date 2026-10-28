import { createServer } from 'node:http';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createExpressOneHandler } from './express-one-portal.mjs';

const port = Number(process.env.EXPRESS_ONE_PREVIEW_PORT || 8791);
const base = `http://127.0.0.1:${port}`;
const previewProfile = process.env.EXPRESS_ONE_PREVIEW_PROFILE_FILE ? JSON.parse(await readFile(process.env.EXPRESS_ONE_PREVIEW_PROFILE_FILE,'utf8')):undefined;
const handler = await createExpressOneHandler({env:{APP_BASE_URL:base,EXPRESS_ONE_PREVIEW:'true',EXPRESS_ONE_OPERATOR_IDENTITIES:process.env.EXPRESS_ONE_OPERATOR_IDENTITIES || '[]'},databasePath:join(import.meta.dirname,'data','express-one-private-preview.sqlite'),previewProfile});
const server = createServer(async (req,res) => {
  if (!(await handler(req,res))) { res.writeHead(404); res.end('Not found'); }
});
server.listen(port,'127.0.0.1',() => console.log(`Private Express One preview: ${base}/express-one`));
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,() => server.close(async () => { await handler.close(); process.exit(0); }));
