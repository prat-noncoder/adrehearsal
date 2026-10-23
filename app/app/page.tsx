"use client";

import { useEffect, useRef, useState } from "react";
import Report from "../components/Report.tsx";
import { ACCEPT, prepareAd, UserFacingError } from "../lib/client/prepareAd.ts";
import type { PreparedAd } from "../lib/client/prepareAd.ts";
import type { RehearseResponse } from "../lib/rehearse.ts";

type Phase = "idle" | "preparing" | "running" | "done" | "error";

const STATES = [
  "Andaman & Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra & Nagar Haveli", "Daman & Diu", "Delhi",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu & Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Lakshadweep", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim",
  "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [tier, setTier] = useState("");
  const [income, setIncome] = useState("");
  const [placement, setPlacement] = useState<"reels" | "feed">("feed");
  const [state, setState] = useState("");
  const [panelSize, setPanelSize] = useState(400);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [data, setData] = useState<RehearseResponse | null>(null);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const reportTop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase !== "running") return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/count-audience", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ageBands: age ? [age] : [],
            sex: sex || undefined,
            tier: tier ? [tier] : [],
            incomeGroup: income || undefined,
            states: state ? [state] : [],
          }),
        });
        const json = await res.json();
        setAudienceCount(json.matched ?? 0);
      } catch {
        setAudienceCount(0);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [age, sex, tier, income, state]);

  async function run() {
    if (!file) return;
    setError(null);
    setData(null);
    setPhase("preparing");
    let prepared: PreparedAd;
    try {
      prepared = await prepareAd(file);
    } catch (e) {
      setPhase("error");
      setError({
        title: "The ad could not be prepared",
        message: e instanceof UserFacingError ? e.message : "This file could not be read in your browser.",
      });
      return;
    }

    setPhase("running");
    try {
      const res = await fetch("/api/rehearse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: prepared.kind,
          frames: prepared.frames,
          videoDurationS: prepared.videoDurationS,
          audience: {
            ageBands: age ? [age] : [],
            sex: sex || undefined,
            tier: tier ? [tier] : [],
            incomeGroup: income || undefined,
            states: state ? [state] : [],
          },
          panelSize,
          placement,
          seed: 1,
        }),
      });
      if (res.status === 413) {
        throw new UserFacingError("This upload is too large. Please use a shorter video or a smaller picture.");
      }
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new UserFacingError(json?.error?.message ?? "The rehearsal could not be completed. Please try again.");
      }
      setData(json as RehearseResponse);
      setPhase("done");
      setTimeout(() => reportTop.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setPhase("error");
      setError({
        title: "The rehearsal did not finish",
        message: e instanceof UserFacingError ? e.message : "The server could not be reached. Check your connection and try again.",
      });
    }
  }

  const busy = phase === "preparing" || phase === "running";

  return (
    <>
      <div className="banner noprint">
        <b>Simulated viewers</b> — shows likely problems, not sales predictions.
      </div>
      <div className="wrap">
        <header>
          <h1>See where people leave your ad, and why, before you spend.</h1>
          <p className="lede">Upload an ad, say who it&rsquo;s for, and watch a panel of simulated Indian viewers react to it, second by second.</p>
        </header>

        <section className="noprint" id="setup">
          <h2>Set up the rehearsal</h2>
          <p className="help">
            Choose an image (JPEG, PNG, WebP) or a video up to about 60 seconds (MP4 or MOV). Only still frames are sent for reading. Sound is not analysed.
          </p>
          <div className="panel">
            <div className="drop">
              <label className="pick" htmlFor="file">Choose an ad (video or image)</label>
              <input id="file" type="file" accept={ACCEPT} disabled={busy}
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); setPhase("idle"); }} />
              <span className="fileNote">{file ? `Chosen: ${file.name}` : "No file chosen."}</span>
            </div>
            <div className="fields">
              <label>Where will it run? (assumed, not India-specific)
                <select value={placement} onChange={(e) => setPlacement(e.target.value as "reels" | "feed")} disabled={busy}>
                  <option value="feed">Instagram Feed or Facebook Feed</option><option value="reels">Instagram Reels</option>
                </select>
              </label>
              <label>State
                <select value={state} onChange={(e) => setState(e.target.value)} disabled={busy}>
                  <option value="">All India</option>{STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>Age
                <select value={age} onChange={(e) => setAge(e.target.value)} disabled={busy}>
                  <option value="">Any</option><option>18-24</option><option>25-34</option><option>35-44</option><option>45-59</option><option>60+</option>
                </select>
              </label>
              <label>Gender
                <select value={sex} onChange={(e) => setSex(e.target.value)} disabled={busy}>
                  <option value="">Any</option><option value="Female">Women</option><option value="Male">Men</option>
                </select>
              </label>
              <label>City type
                <select value={tier} onChange={(e) => setTier(e.target.value)} disabled={busy}>
                  <option value="">Any</option><option value="metro">Metro</option><option value="urban_other">Other city or town</option><option value="rural">Rural</option>
                </select>
              </label>
              <label>Income group (assumed)
                <select value={income} onChange={(e) => setIncome(e.target.value)} disabled={busy}>
                  <option value="">Any</option><option value="lower">Lower</option><option value="middle">Middle</option><option value="upper">Upper</option>
                </select>
              </label>
              <label>Panel size
                <select value={panelSize} onChange={(e) => setPanelSize(Number(e.target.value))} disabled={busy}>
                  <option value={200}>200 (~6s)</option>
                  <option value={400}>400 (~12s)</option>
                  <option value={1000}>1,000 (~30s)</option>
                  <option value={5000}>5,000 (~2.5 min)</option>
                  <option value={20000}>All matching (up to 20,000) (~10 min)</option>
                </select>
              </label>
            </div>
            {audienceCount !== null && !busy && (
              <p className="help" style={{ marginTop: 16, marginBottom: 0, color: "var(--ink)" }}>
                We found <strong>{audienceCount.toLocaleString()} people</strong> in our data matching these filters. We'll sample {panelSize} of them for this run.
              </p>
            )}
            {panelSize >= 5000 && (
              <p className="notice" style={{ marginTop: 16 }}>Larger runs take longer and cost more. Pick a smaller size for a quick demo.</p>
            )}
            <button className="go" type="button" disabled={!file || busy} onClick={run}>Run the rehearsal</button>
            {phase === "preparing" && <p className="status" role="status">Step 1 of 2: preparing your ad in this browser…</p>}
            {phase === "running" && (
              <p className="status" role="status">
                Step 2 of 2: reading the ad, simulating {panelSize} viewers and writing the reasons. This usually takes 10 to 40 seconds ({elapsed}s so far).
              </p>
            )}
            {error && (
              <div className="err" role="alert">
                <b>{error.title}</b>
                {error.message}
              </div>
            )}
          </div>
        </section>

        <div ref={reportTop} />
        {data && phase === "done" && (
          <Report data={data} onAgain={() => { setPhase("idle"); setData(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        )}
      </div>
    </>
  );
}
