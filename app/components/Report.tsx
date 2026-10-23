"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RehearseResponse, ResponseGroup } from "../lib/rehearse.ts";

const CAUSE_LABEL: Record<string, string> = {
  slow_open: "Slow opening",
  unclear_offer: "Unclear offer",
  price_shock: "Price put them off",
  trust_doubt: "Doubt about trust",
  text_heavy: "Too much text",
  brand_first: "Led with the brand",
  off_putting_presenter: "Presenter did not appeal",
  nothing_new: "Nothing felt new",
  too_long: "Felt too long",
  not_relevant: "Not relevant to them",
  lost_interest: "Attention faded",
};
const AGREEMENT_LABEL = { strong: "Strong agreement", medium: "Medium agreement", weak: "Weak agreement" } as const;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function RetentionCurve({ retention, duration, t }: { retention: number[]; duration: number; t: number }) {
  const W = 320, H = 130, L = 30, R = 8, T = 8, B = 22;
  const X = (s: number) => L + (s / duration) * (W - L - R);
  const Y = (v: number) => T + (1 - v) * (H - T - B);
  const pts = retention.map((v, s) => `${X(s)},${Y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chart of the share of viewers still watching over ${duration} seconds`}>
      <line className="axis" x1={L} y1={Y(0)} x2={W - R} y2={Y(0)} />
      <line className="axis" x1={L} y1={Y(1)} x2={L} y2={Y(0)} />
      <text className="lab" x={2} y={Y(1) + 4}>100%</text>
      <text className="lab" x={8} y={Y(0) + 4}>0</text>
      <text className="lab" x={L} y={H - 6}>0:00</text>
      <text className="lab" x={X(duration / 2) - 10} y={H - 6}>{clock(duration / 2)}</text>
      <text className="lab" x={W - R - 26} y={H - 6}>{clock(duration)}</text>
      <polyline className="line" points={pts} />
      <line className="mark" x1={X(t)} x2={X(t)} y1={T} y2={Y(0)} />
    </svg>
  );
}

export default function Report({ data, onAgain }: { data: RehearseResponse; onAgain: () => void }) {
  const total = data.dots.length;
  const duration = data.timeline.durationS;
  const chunks = data.timeline.chunks;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setT((prev) => {
        const next = Math.min(duration, prev + 0.5);
        if (next >= duration) setPlaying(false);
        return next;
      });
    }, 350);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, duration]);

  const still = useMemo(() => data.dots.filter((d) => d.exitS === null || d.exitS > t).length, [data.dots, t]);
  const columns = total <= 200 ? 20 : total <= 400 ? 25 : 40;
  const midS = Math.ceil(chunks.length / 2) * 3;
  const showHold = chunks.length > 2;
  const nowWindow = Math.min(Math.floor(t / 3), chunks.length - 1);

  const byWindow = useMemo(() => {
    const m = new Map<number, ResponseGroup[]>();
    for (const g of data.groups) m.set(g.startS, [...(m.get(g.startS) ?? []), g]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [data.groups]);

  const cost = data.costInfo.totalCostUsd;
  const tokens = [data.costInfo.readAd, data.costInfo.reasons].reduce(
    (n, p) => n + (p ? p.promptTokens + p.completionTokens : 0),
    0,
  );

  return (
    <section id="report" aria-live="polite">
      <h2>The report</h2>
      <p className="headline">{data.headline}</p>
      {data.panel.note && <p className="notice">{data.panel.note}</p>}

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="key">
          <div><strong>{pct(data.funnel.hook)}</strong><span>still watching at 3 seconds (the hook)</span></div>
          {showHold && (
            <div><strong>{pct(data.funnel.hold)}</strong><span>still watching at {midS} seconds (the hold, midpoint)</span></div>
          )}
          <div><strong>{pct(data.funnel.end)}</strong><span>watched to the end, {duration} seconds</span></div>
          <div>
            <strong>{pct(data.funnel.tap)}</strong>
            <span>would tap to learn more (stated intent, assumed; {data.funnel.tapEligible} watched enough to tap)</span>
          </div>
        </div>
        <p className="small">All viewers are simulated. The curve between 3-second marks is drawn as a straight line (interpolated).</p>
        <div className="curve"><RetentionCurve retention={data.retention} duration={duration} t={t} /></div>
      </div>

      <h2 style={{ marginTop: 28 }}>Who was in the panel</h2>
      <div className="panel">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <p><b>Age:</b> {data.panelComposition.ageGroups.map((a) => a.count >= 30 ? `${a.label} (${a.count})` : null).filter(Boolean).join(", ") || "(all groups too small)"}</p>
            <p><b>Gender:</b> {data.panelComposition.genders.map((g) => g.count >= 30 ? `${g.label} (${g.count})` : null).filter(Boolean).join(", ") || "(all groups too small)"}</p>
            <p><b>City type:</b> {data.panelComposition.tiers.map((t) => t.count >= 30 ? `${t.label} (${t.count})` : null).filter(Boolean).join(", ") || "(all groups too small)"}</p>
            <p><b>Income group:</b> {data.panelComposition.incomeGroups.map((i) => i.count >= 30 ? `${i.label} (${i.count})` : null).filter(Boolean).join(", ") || "(all groups too small)"}</p>
          </div>
          <div>
            <p><b>Still watching at 3 seconds:</b> {data.panelComposition.watched} of {total}</p>
            <p><b>Left in the first 3 seconds:</b> {data.panelComposition.leftIn3s} of {total}</p>
          </div>
        </div>
        <p className="small" style={{ marginTop: 12 }}>Groups smaller than 30 people are not shown ("too few people to say").</p>
      </div>

      <h2 style={{ marginTop: 28 }}>Each dot is one simulated viewer</h2>
      <p className="help noprint">Drag the slider through the ad, or press Play, and watch who is still watching.</p>
      <div className="panel">
        <div className="seats" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }} aria-hidden="true">
          {data.dots.map((d, i) => (
            <i key={i} className={d.exitS !== null && d.exitS <= t ? "gone" : ""} />
          ))}
        </div>
        <div className="scrub">
          <button className="play" type="button" onClick={() => {
            if (playing) { setPlaying(false); return; }
            if (t >= duration) setT(0);
            setPlaying(true);
          }}>{playing ? "Pause" : "Play"}</button>
          <input type="range" min={0} max={duration} step={0.5} value={t} aria-label="Seconds into the ad"
            onChange={(e) => { setPlaying(false); setT(parseFloat(e.target.value)); }} />
          <span className="clock">{clock(t)}</span>
        </div>
        <p className="count">At {clock(t)}, {still} of {total} are still watching.</p>
      </div>

      <h2 style={{ marginTop: 28 }}>Why people left</h2>
      <p className="help">
        Each reason is tied to a moment in the ad. Counts come from the maths. Agreement shows how many of the people who left in that
        window were counted under the same cause.
      </p>
      {data.reasonsNote && <p className="notice">{data.reasonsNote}</p>}
      <div className="panel">
        {byWindow.length === 0 && <p>Nobody left during this ad in this simulation.</p>}
        {byWindow.map(([startS, groups]) => {
          const k = Math.round(startS / 3);
          const chunk = chunks[k];
          const windowTotal = groups.reduce((n, g) => n + g.count, 0);
          return (
            <div key={startS} className={`win${k === nowWindow ? " now" : ""}`}>
              <h3>{startS}-{startS + 3} seconds: {windowTotal} left</h3>
              <p className="screen">
                On screen then: {chunk?.visual || "(no description)"}
                {chunk?.text ? ` Text: "${chunk.text}"` : ""}
              </p>
              <ul className="why">
                {groups.map((g) => (
                  <li key={g.cause}>
                    <span className="n">&ldquo;{g.reason}&rdquo;</span>
                    <span className="tag s">{AGREEMENT_LABEL[g.label]}</span>
                    <span className={`tag${g.reasonSource === "ai" ? "" : " warn"}`}>
                      {g.reasonSource === "ai" ? "worded by AI" : "template, not AI"}
                    </span>
                    <br />
                    <span className="small">
                      Cause: {CAUSE_LABEL[g.cause] ?? g.cause}. {g.count} of {windowTotal} ({pct(g.share)}) who left in this window.
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="panel" style={{ marginTop: 28 }}>
        <details>
          <summary>ℹ️ Assumed in this run (expand to see)</summary>
          <p className="help">Everything below is a starting guess or a limit of this version, not a measured fact.</p>
          <ul className="assumed">
            {data.assumptions.map((a) => (
              <li key={a.title}><b>{a.title}.</b> {a.detail}</li>
            ))}
          </ul>
        </details>
        <p className="small" style={{ marginTop: 12 }}>
          Panel: {data.panel.used} viewers used of {data.panel.requested} requested. Seed {data.seed} (the same ad and settings give the
          same result). AI model: {data.costInfo.model}.
          {` AI use this run: ${tokens.toLocaleString()} tokens.`}
          {cost !== null && cost > 0
            ? ` Cost reported by OpenRouter: about $${cost.toFixed(4)}.`
            : " OpenRouter reported no cost for this run (it may not show real billing)."}
        </p>
      </div>

      <p className="footer">Simulated viewers. This explains likely problems. It does not predict sales.</p>
      <div className="actions noprint">
        <button className="go" type="button" onClick={() => window.print()}>Download PDF</button>
        <button className="ghost" type="button" onClick={onAgain}>Run again</button>
      </div>
    </section>
  );
}
