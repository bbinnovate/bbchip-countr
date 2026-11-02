"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { saveHostProfile } from "@/lib/host-profile";
import { normalizePhone } from "@/lib/phone";

export function HostDetailsModal({
  uid,
  playerCode,
  onSaved,
  onClose,
}: {
  uid: string;
  playerCode: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanPhone = normalizePhone(phone);
    if (!cleanName) {
      setError("Enter your name.");
      return;
    }
    if (!cleanPhone) {
      setError("Enter a valid phone number.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveHostProfile(uid, { name: cleanName, phone: cleanPhone, playerCode });
      onSaved();
    } catch (err) {
      console.error("Failed to save host details:", err);
      setError("Couldn't save your details. Check your connection and try again.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4">
      <form onSubmit={submit} noValidate className="surface metallic w-full max-w-lg p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-muted-foreground">
              BEFORE YOU DEAL
            </p>
            <h3 className="gold-text mt-1 text-2xl font-extrabold">Your details</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Add your name and number to start the game. Other players can&apos;t see your number.
        </p>

        <label htmlFor="host-name" className="mt-4 block text-sm font-bold">
          Name
        </label>
        <input
          id="host-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoComplete="name"
          autoFocus
          className="mt-2 w-full rounded-lg border border-border bg-secondary px-4 py-3 text-base font-semibold"
        />

        <label htmlFor="host-phone" className="mt-4 block text-sm font-bold">
          Phone number
        </label>
        <input
          id="host-phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          className="tabular mt-2 w-full rounded-lg border border-border bg-secondary px-4 py-3 text-base font-semibold"
        />

        {error && (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        )}

        <button type="submit" disabled={saving} className="btn-gold mt-5 w-full py-4 text-sm">
          {saving ? "Saving..." : "Deal me in"}
        </button>
      </form>
    </div>
  );
}
