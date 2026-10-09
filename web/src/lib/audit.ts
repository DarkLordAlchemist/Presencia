import "server-only";
import { prisma } from "@/lib/prisma";

export async function logAudit(params: {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason ?? null,
      beforeJson: params.before !== undefined ? JSON.stringify(params.before) : null,
      afterJson: params.after !== undefined ? JSON.stringify(params.after) : null,
    },
  });
}
