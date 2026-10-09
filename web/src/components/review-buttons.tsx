"use client";

import { useTransition } from "react";
import { reviewLeave } from "@/lib/actions/leave";
import { reviewShiftRequest } from "@/lib/actions/shift-requests";
import { reviewCorrection } from "@/lib/actions/corrections";
import { reviewCertificateRequest } from "@/lib/actions/certificates";

const REVIEWERS = {
  leave: reviewLeave,
  shift: reviewShiftRequest,
  correction: reviewCorrection,
  certificate: reviewCertificateRequest,
} as const;

export function ReviewButtons({
  requestId,
  kind,
}: {
  requestId: string;
  kind: keyof typeof REVIEWERS;
}) {
  const [pending, startTransition] = useTransition();
  const review = REVIEWERS[kind];

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => review(requestId, "APPROVED"))}
        className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => review(requestId, "REJECTED"))}
        className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}
