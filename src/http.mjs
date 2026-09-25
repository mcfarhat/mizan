// fetch wrapper that records latency + status for the DX journal
export const calls = [];
export async function timedFetch(label, url, opts = {}) {
  const t0 = performance.now();
  let status = 0, body = null, err = null;
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
    status = r.status;
    const text = await r.text();
    try { body = JSON.parse(text); } catch { body = text.slice(0, 2000); }
  } catch (e) { err = String(e?.cause?.code || e?.message || e); }
  const ms = Math.round(performance.now() - t0);
  calls.push({ label, url: url.replace(/(apikey|token)=[^&]+/i, '$1=***'), status, ms, err });
  return { status, body, ms, err };
}
