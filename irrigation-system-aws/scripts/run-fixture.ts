import * as fs from 'fs';
import * as path from 'path';
import { handler as ingestCommandResultHandler } from '../lambdas/handlers/ingest-command-result';
import { handler as timeoutCommandsHandler } from '../lambdas/handlers/timeout-commands';

const [mode, fixturePath] = process.argv.slice(2);

const run = async (): Promise<void> => {
  if (mode === 'ingest') {
    if (!fixturePath) {
      throw new Error('Missing fixture path. Usage: ts-node scripts/run-fixture.ts ingest scripts/fixtures/<file>.json');
    }

    const abs = path.resolve(fixturePath);
    const raw = fs.readFileSync(abs, 'utf8');
    const event = JSON.parse(raw) as Record<string, unknown>;

    const result = await ingestCommandResultHandler(event);
    console.log(result.body);
    return;
  }

  if (mode === 'timeout') {
    const result = await timeoutCommandsHandler();
    console.log(result.body);
    return;
  }

  throw new Error('Unknown mode. Use "ingest" or "timeout".');
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
});
