import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Create a temporary directory for test isolation, returns path and cleanup fn */
export async function createTempDir(): Promise<{
  path: string;
  cleanup: () => Promise<void>;
}> {
  const path = await mkdtemp(join(tmpdir(), "jalenclaw-test-"));
  return {
    path,
    cleanup: () => rm(path, { recursive: true, force: true }),
  };
}
