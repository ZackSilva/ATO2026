"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useWorkspace } from "./workspace-shell";
import "./card-lookup.css";

export type CertificateDraft = {
  subject: string;
  sport?: string;
  year: number | null;
  manufacturer: string;
  set_name: string;
  card_number: string;
  parallel: string;
  condition: "graded";
  grader: string;
  grade: string;
  certification: string;
};

type GraderStatus = { grader: string; supported: boolean; configured: boolean; verification_url: string };
type Proposal = { state: "found" | "not_found" | "unavailable"; draft: CertificateDraft | null; verification_url: string; notice: string };
type Props = { grader: string; certification: string; onCertificationChange: (value: string) => void; onApply: (draft: CertificateDraft) => void; disabled: boolean };

const officialSites: Record<string, string> = {
  PSA: "https://www.psacard.com/cert/",
  BGS: "https://www.beckett.com/",
  SGC: "https://www.gosgc.com/cert-code-lookup",
  CGC: "https://www.cgccards.com/certlookup/",
  TAG: "https://taggrading.com/pages/cert-search",
};

function officialLink(grader: string, candidate?: string) {
  const fallback = officialSites[grader];
  if (!candidate || !fallback) return fallback;
  try {
    const url = new URL(candidate);
    if (url.protocol === "https:" && url.hostname === new URL(fallback).hostname && !url.username && !url.password && !url.port) return url.href;
  } catch { /* Keep the known official page when the returned URL is invalid. */ }
  return fallback;
}

export default function CertificateField({ grader, certification, onCertificationChange, onApply, disabled }: Props) {
  const { session, onExpired } = useWorkspace();
  const id = useId();
  const company = grader.trim().toUpperCase();
  const number = certification.trim();
  const key = `${company}:${number}`;
  const pending = useRef<AbortController | null>(null);
  const lastAttempt = useRef("");
  const [graders, setGraders] = useState<GraderStatus[] | null>(null);
  const [statusError, setStatusError] = useState("");
  const [request, setRequest] = useState<{ key: string; busy: boolean; error?: string; proposal?: Proposal } | null>(null);
  const current = request?.key === key ? request : null;
  const status = graders?.find(item => item.grader === company);
  const available = Boolean(status?.supported && status.configured);
  const proposal = current?.proposal;
  const verificationUrl = officialLink(company, proposal?.verification_url ?? status?.verification_url);

  useEffect(() => {
    const controller = new AbortController();
    void api<{ graders: GraderStatus[] }>("/certificates/status", { signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) setGraders(response.graders);
    }).catch(failure => {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else setStatusError("Certificate lookup status is unavailable. You can enter the details manually.");
    });
    return () => controller.abort();
  }, [onExpired]);

  useEffect(() => {
    // Clear the previous grader's request after effects run, including an aborted busy state.
    const reset = window.setTimeout(() => { setRequest(null); }, 0);
    return () => {
      window.clearTimeout(reset);
      pending.current?.abort();
      pending.current = null;
      lastAttempt.current = "";
    };
  }, [key]);

  async function lookup(automatic = false) {
    if (disabled || !available || pending.current || (automatic && lastAttempt.current === key)) return;
    if (company === "PSA" && !/^[0-9]{6,12}$/.test(number)) {
      if (!automatic) setRequest({ key, busy: false, error: "Enter a PSA certificate number containing 6 to 12 digits." });
      return;
    }
    if (!number || number.length > 100 || !/^[A-Za-z0-9-]+$/.test(number)) {
      if (!automatic) setRequest({ key, busy: false, error: "Enter the certificate number using letters, numbers, or hyphens." });
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    lastAttempt.current = key;
    setRequest({ key, busy: true });
    try {
      const response = await api<Proposal>("/certificates/lookup", {
        method: "POST",
        headers: { "X-CSRF-Token": session.csrf_token },
        body: JSON.stringify({ grader: company, certification: number }),
        signal: controller.signal,
      });
      if (!controller.signal.aborted && pending.current === controller) setRequest({ key, busy: false, proposal: response });
    } catch (failure) {
      if (controller.signal.aborted || pending.current !== controller) return;
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else setRequest({ key, busy: false, error: `${failure instanceof Error ? failure.message : "Certificate lookup is unavailable."} You can enter the details manually.` });
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }

  return <div className="wide">
    <label htmlFor={id}>Certification number<input id={id} name="certification" value={certification} maxLength={100} disabled={disabled} aria-describedby={`${id}-help`} onChange={event => {
      pending.current?.abort();
      pending.current = null;
      lastAttempt.current = "";
      setRequest(null);
      onCertificationChange(event.target.value);
    }} onBlur={() => { if (company === "PSA") void lookup(true); }} /></label>
    <p className="card-lookup-note" id={`${id}-help`}>{statusError || (!graders ? "Checking certificate lookup availability…" : !status?.supported ? `Automated ${company || "grader"} lookup is not supported. Enter the details manually.` : !status.configured ? "PSA certificate lookup is not configured on the server. Enter the details manually." : "PSA lookup runs when you leave this field. Review the returned details before applying them.")}</p>
    {available && <button type="button" className="text-button" disabled={disabled || current?.busy || !number} onClick={() => void lookup()}>{current?.busy ? "Looking up certificate…" : "Look up certificate"}</button>}
    {verificationUrl && <p className="card-lookup-note"><a href={verificationUrl} target="_blank" rel="noopener noreferrer">Check on {company}’s official site</a></p>}
    <div role="status" className="card-lookup-status">{current?.busy ? "Looking up certificate details…" : proposal?.state === "not_found" ? "No card found for this certificate. Check the number or enter the details manually." : proposal?.state === "unavailable" ? "Certificate lookup is unavailable. Enter the details manually." : ""}</div>
    {current?.error && <p role="alert" className="error">{current.error}</p>}
    {proposal?.state === "found" && proposal.draft && <section className="card-lookup" aria-labelledby={`${id}-proposal`}>
      <h3 id={`${id}-proposal`}>Certificate details to review</h3>
      <p>{proposal.draft.subject}</p>
      <p className="card-lookup-note">{[proposal.draft.year, proposal.draft.set_name, proposal.draft.card_number ? `#${proposal.draft.card_number}` : "", proposal.draft.parallel, `${proposal.draft.grader} ${proposal.draft.grade}`].filter(value => value !== null && value !== "").join(" · ")}</p>
      <p className="card-lookup-note">{proposal.notice}</p>
      <button type="button" className="secondary" disabled={disabled || current?.busy} onClick={() => { if (request?.key === key && proposal.draft) onApply(proposal.draft); }}>Use certificate details</button>
    </section>}
    {proposal && proposal.state !== "found" && <p className="card-lookup-note">{proposal.notice}</p>}
  </div>;
}
