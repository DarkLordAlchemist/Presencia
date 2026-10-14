import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptEmbedding } from "./encryption";
import type { VerifyCandidate } from "./engine-client";

export interface EnrolledUser {
  id: string;
  name: string;
}

/** Every active person's every reference angle, flattened into one
 * candidate list for face-engine's /verify. A person with five angles
 * contributes five candidates under the same user_id; /verify keeps the
 * best-scoring one, so an off-angle scan is matched against whichever
 * stored angle it's closest to. */
export async function loadFaceCandidates(): Promise<{
  users: EnrolledUser[];
  candidates: VerifyCandidate[];
}> {
  const rows = await prisma.faceEmbedding.findMany({
    where: { user: { active: true } },
    select: { embeddingEnc: true, user: { select: { id: true, name: true } } },
  });

  const users = new Map<string, EnrolledUser>();
  const candidates: VerifyCandidate[] = rows.map((r) => {
    users.set(r.user.id, r.user);
    return { user_id: r.user.id, embedding: decryptEmbedding(r.embeddingEnc) };
  });

  return { users: [...users.values()], candidates };
}
