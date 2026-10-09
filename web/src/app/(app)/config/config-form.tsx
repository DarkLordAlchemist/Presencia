"use client";

import { useActionState, useState } from "react";
import { updateSystemConfig, type FormState } from "@/lib/actions/system-config";
import type { SystemConfig } from "@/generated/prisma/client";

const initialState: FormState = {};
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function ConfigForm({ config }: { config: SystemConfig }) {
  const [state, formAction, pending] = useActionState(updateSystemConfig, initialState);
  const [matchThreshold, setMatchThreshold] = useState(config.matchThreshold);
  const [livenessSensitivity, setLivenessSensitivity] = useState(config.livenessSensitivity);
  const [geofenceEnabled, setGeofenceEnabled] = useState(config.geofenceEnabled);
  const [ipLockEnabled, setIpLockEnabled] = useState(config.ipLockEnabled);

  return (
    <form action={formAction} className="mt-6 flex max-w-lg flex-col gap-6">
      <div>
        <label htmlFor="matchThreshold" className={labelClass}>
          Face-match confidence threshold: {matchThreshold.toFixed(2)}
        </label>
        <input
          id="matchThreshold"
          name="matchThreshold"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={matchThreshold}
          onChange={(e) => setMatchThreshold(Number(e.target.value))}
          className="mt-2 w-full"
        />
      </div>

      <div>
        <label htmlFor="livenessSensitivity" className={labelClass}>
          Liveness sensitivity: {livenessSensitivity.toFixed(2)}
        </label>
        <input
          id="livenessSensitivity"
          name="livenessSensitivity"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={livenessSensitivity}
          onChange={(e) => setLivenessSensitivity(Number(e.target.value))}
          className="mt-2 w-full"
        />
      </div>

      <hr className="border-zinc-200 dark:border-zinc-800" />

      <div>
        <label htmlFor="gracePeriodMinutes" className={labelClass}>
          Grace period (minutes)
        </label>
        <input
          id="gracePeriodMinutes"
          name="gracePeriodMinutes"
          type="number"
          min={0}
          step={1}
          defaultValue={config.gracePeriodMinutes}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="maxBreakMinutes" className={labelClass}>
          Max single break duration (minutes)
        </label>
        <input
          id="maxBreakMinutes"
          name="maxBreakMinutes"
          type="number"
          min={0}
          step={1}
          defaultValue={config.maxBreakMinutes}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="maxDailyBreakMinutes" className={labelClass}>
          Max total break time per day (minutes)
        </label>
        <input
          id="maxDailyBreakMinutes"
          name="maxDailyBreakMinutes"
          type="number"
          min={0}
          step={1}
          defaultValue={config.maxDailyBreakMinutes}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Sum of every break in a day, however it's split (e.g. a 1-hour lunch
          plus a 30-minute break, or two 15-minute breaks instead). Default of
          90 matches a typical Philippine 1-hour lunch + 30-minute break.
        </p>
      </div>

      <div className="flex gap-4">
        <div>
          <label htmlFor="nightDiffStart" className={labelClass}>
            Night differential start
          </label>
          <input
            id="nightDiffStart"
            name="nightDiffStart"
            type="time"
            defaultValue={config.nightDiffStart}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="nightDiffEnd" className={labelClass}>
            Night differential end (next day)
          </label>
          <input
            id="nightDiffEnd"
            name="nightDiffEnd"
            type="time"
            defaultValue={config.nightDiffEnd}
            className={inputClass}
          />
        </div>
      </div>

      <hr className="border-zinc-200 dark:border-zinc-800" />

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          <input
            id="geofenceEnabled"
            type="checkbox"
            name="geofenceEnabled"
            checked={geofenceEnabled}
            onChange={(e) => setGeofenceEnabled(e.target.checked)}
          />
          Enforce GPS geofencing on clock-in
        </label>
        {geofenceEnabled && (
          <div className="mt-2 flex flex-wrap gap-4">
            <div>
              <label htmlFor="geofenceLat" className={labelClass}>
                Center latitude
              </label>
              <input
                id="geofenceLat"
                name="geofenceLat"
                type="number"
                step="any"
                defaultValue={config.geofenceLat ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="geofenceLng" className={labelClass}>
                Center longitude
              </label>
              <input
                id="geofenceLng"
                name="geofenceLng"
                type="number"
                step="any"
                defaultValue={config.geofenceLng ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="geofenceRadiusMeters" className={labelClass}>
                Radius (meters)
              </label>
              <input
                id="geofenceRadiusMeters"
                name="geofenceRadiusMeters"
                type="number"
                min={1}
                step={1}
                defaultValue={config.geofenceRadiusMeters}
                className={inputClass}
              />
            </div>
          </div>
        )}
        {!geofenceEnabled && (
          <input type="hidden" name="geofenceRadiusMeters" value={config.geofenceRadiusMeters} />
        )}
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          <input
            id="ipLockEnabled"
            type="checkbox"
            name="ipLockEnabled"
            checked={ipLockEnabled}
            onChange={(e) => setIpLockEnabled(e.target.checked)}
          />
          Restrict clock-in to allowed IP addresses/prefixes
        </label>
        {ipLockEnabled && (
          <div className="mt-2">
            <label htmlFor="allowedIpPrefixes" className={labelClass}>
              Allowed IPs/prefixes (comma-separated)
            </label>
            <input
              id="allowedIpPrefixes"
              name="allowedIpPrefixes"
              defaultValue={config.allowedIpPrefixes ?? ""}
              placeholder="192.168.1., 203.0.113.9"
              className={inputClass}
            />
          </div>
        )}
      </div>

      <hr className="border-zinc-200 dark:border-zinc-800" />

      <div>
        <label htmlFor="workingDaysPerMonth" className={labelClass}>
          Working days per month (payslip rate divisor)
        </label>
        <input
          id="workingDaysPerMonth"
          name="workingDaysPerMonth"
          type="number"
          min={1}
          step="0.01"
          defaultValue={config.workingDaysPerMonth}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Divides monthly compensation into a daily rate (then /8 for an hourly rate) on
          generated payslips. Companies differ on this — 22 for a 5-day work week, 26 for a
          6-day week, 21.75 (261/12) or 26.08 (313/12) for other conventions. Get this wrong
          and every payslip's suggested pay is wrong, so set it deliberately.
        </p>
      </div>

      <div>
        <label htmlFor="companyName" className={labelClass}>
          Company name (for Certificate of Employment documents)
        </label>
        <input
          id="companyName"
          name="companyName"
          defaultValue={config.companyName ?? ""}
          placeholder="ACME Corporation"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="payrollWebhookUrl" className={labelClass}>
          Payroll/HRIS webhook URL (optional)
        </label>
        <input
          id="payrollWebhookUrl"
          name="payrollWebhookUrl"
          type="url"
          defaultValue={config.payrollWebhookUrl ?? ""}
          placeholder="https://your-payroll-system.example/webhooks/presentia"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          When set, the Reports page can push a computed pay-period export to this URL.
        </p>
      </div>

      <div>
        <label htmlFor="certificateSignatoryName" className={labelClass}>
          Certificate signatory name
        </label>
        <input
          id="certificateSignatoryName"
          name="certificateSignatoryName"
          defaultValue={config.certificateSignatoryName ?? ""}
          placeholder="Juana Dela Cruz"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="certificateSignatoryTitle" className={labelClass}>
          Certificate signatory title
        </label>
        <input
          id="certificateSignatoryTitle"
          name="certificateSignatoryTitle"
          defaultValue={config.certificateSignatoryTitle ?? "Head of Human Resources"}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          This name/title is what prints on every Certificate of Employment — deliberately not
          whoever happened to click Approve, since that could be any System Admin or HR Admin
          account. Set this to your actual Head of HR (or whoever is the designated signatory).
        </p>
      </div>

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600 dark:text-green-400">Saved.</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
