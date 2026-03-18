// src/auth/pkce.ts
import { randomBytes, createHash } from "node:crypto";

export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
  challengeMethod: "S256";
}

export function generatePKCE(): PKCEPair {
  const codeVerifier = randomBytes(48)
    .toString("base64url")
    .slice(0, 64);

  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { codeVerifier, codeChallenge, challengeMethod: "S256" };
}
