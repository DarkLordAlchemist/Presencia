"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/dal";
import { enrollFace } from "@/lib/face/engine-client";
import { encryptEmbedding } from "@/lib/face/encryption";
import { ENROLL_POSES, type PoseId } from "@/lib/face/poses";

export interface EnrollResult {
  error?: string;
  success?: boolean;
  savedCount?: number;
  failedPose?: PoseId; // which photo face-engine rejected, so the form can send HR back to retake just that one
}

export interface CheckPhotoResult {
  error?: string;
  ok?: boolean;
}

/** Quick per-photo check while HR is still capturing — runs the same
 * face-engine /enroll validation (exactly one face, detectable) so a bad
 * angle gets retaken on the spot instead of failing the whole batch at
 * the end. Nothing is saved. */
export async function checkEnrollPhoto(formData: FormData): Promise<CheckPhotoResult> {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");
  const image = formData.get("image");
  if (!(image instanceof Blob) || image.size === 0) return { error: "No photo captured." };
  const result = await enrollFace(image);
  if (!result.ok) return { error: result.error };
  return { ok: true };
}

/** Saves one reference embedding per captured angle. "replace" clears the
 * person's existing angles first (a fresh enrollment); "add" keeps them
 * and appends (new glasses, haircut, a camera at a different height). All
 * photos are validated before anything is written, so a half-saved
 * enrollment can't happen. */
export async function enrollEmployeeFace(formData: FormData): Promise<EnrollResult> {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const userId = formData.get("userId");
  const mode = formData.get("mode") === "add" ? "add" : "replace";

  if (typeof userId !== "string" || userId.length === 0) {
    return { error: "No employee selected." };
  }

  const images: { pose: PoseId; blob: Blob }[] = [];
  for (const pose of ENROLL_POSES) {
    const image = formData.get(`image_${pose.id}`);
    if (image instanceof Blob && image.size > 0) images.push({ pose: pose.id, blob: image });
  }
  if (images.length === 0) {
    return { error: "No photos captured." };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { error: "That user no longer exists." };
  }

  const embeddings: { pose: PoseId; embeddingEnc: string }[] = [];
  for (const { pose, blob } of images) {
    const result = await enrollFace(blob);
    if (!result.ok) {
      const label = ENROLL_POSES.find((p) => p.id === pose)?.label ?? pose;
      return { error: `${label}: ${result.error}`, failedPose: pose };
    }
    embeddings.push({ pose, embeddingEnc: encryptEmbedding(result.data.embedding) });
  }

  await prisma.$transaction([
    ...(mode === "replace" ? [prisma.faceEmbedding.deleteMany({ where: { userId } })] : []),
    prisma.faceEmbedding.createMany({ data: embeddings.map((e) => ({ userId, ...e })) }),
    prisma.user.update({
      where: { id: userId },
      data: { faceEnrolledAt: mode === "replace" || !user.faceEnrolledAt ? new Date() : user.faceEnrolledAt },
    }),
  ]);

  revalidatePath("/enroll");
  revalidatePath("/users");
  return { success: true, savedCount: embeddings.length };
}
