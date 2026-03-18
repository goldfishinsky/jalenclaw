// src/auth/token-store.ts
import { readFile, writeFile, unlink, mkdir, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

const oauthCredentialsSchema = z.object({
  version: z.literal(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number(),
  scopes: z.array(z.string()),
});

export type OAuthCredentials = z.infer<typeof oauthCredentialsSchema>;

export async function readTokens(
  path: string,
): Promise<OAuthCredentials | null> {
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
    const result = oauthCredentialsSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function writeTokens(
  path: string,
  tokens: OAuthCredentials,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(tokens, null, 2), "utf-8");
  await chmod(path, 0o600);
}

export async function deleteTokens(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
