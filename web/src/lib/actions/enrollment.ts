"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/dal";
import { enrollFace } from "@/lib/face/engine-client";
import { encryptEmbedding } from "@/lib/face/encryption";

export interface EnrollResult {
  error?: string;
  success?: boolean;
}

export async function enrollEmployeeFace(formData: FormData): Promise<EnrollResult> {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const userId = formData.get("userId");
  const image = formData.get("image");

  if (typeof userId !== "string" || userId.length === 0) {
    return { error: "No employee selected." };
  }
  if (!(image instanceof Blob) || image.size === 0) {
    return { error: "No photo captured." };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { error: "That user no longer exists." };
  }

  const result = await enrollFace(image);
  if (!result.ok) {
    return { error: result.error };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      faceEmbeddingEnc: encryptEmbedding(result.data.embedding),
      faceEnrolledAt: new Date(),
    },
  });

  revalidatePath("/enroll");
  return { success: true };
}
