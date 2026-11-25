/* ID7: identity return app. Vanilla JS, no build step.
   Everything the user writes is saved on the device (localStorage). */
(function () {
  "use strict";

  // ---------- Content ----------
  // All method text lives in content.js (local development) or in the encrypted
  // content.enc.json (published), unlocked on the phone with the user's passcode.
  let C, LEVELS, STAGES, PRACTICES, RETURNS, SX, SESSION;
  function setContent(c) {
    C = c; LEVELS = c.levels; STAGES = c.stages; PRACTICES = c.practices || [];
    RETURNS = (c.returnPrompts && c.returnPrompts.length) ? c.returnPrompts : ["Who is doing this right now?"];
    SX = c.session;
    SESSION = [
      { kind: "intro" },
      ...SX.intake.map((q) => Object.assign({ kind: "text" }, q)),
      { kind: "scale", key: "desire", eyebrow: "Desire", q: SX.desireQ },
      { kind: "sketch" },
      { kind: "embody" },
      ...LEVELS.map((l) => ({ kind: "level", level: l.id })),
      { kind: "identity" },
      { kind: "switch" },
      { kind: "close" }
    ];
  }

  // ---------- Storage ----------
  const KEY = "id7.v1";
  const blank = () => ({
    identity: null,        // { statement, levels:{1..7}, intake:{}, switchCue, createdAt }
    past: [],              // previous identities
    draft: null,           // in-progress Identity Session
    stage: null,           // where on the wheel
    journal: [],           // { id, at, kind: 'practice'|'celebration'|'note', practiceId, title, text }
    done: {},              // { 'YYYY-MM-DD': [practiceId] }
    switchCount: 0
  });
  let S;
  function load() {
    try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); }
    catch (e) { S = blank(); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast("Couldn't save on this device"); }
  }
  load();

  // ---------- Helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const view = $("#view");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const idText = () => (S.identity && S.identity.statement) || "your next-level self";
  const fill = (s) => esc(s).replace(/\{identity\}/g, '<span class="serif" style="color:var(--gold-2)">' + esc(idText()) + "</span>");
  const fillPlain = (s) => String(s).replace(/\{identity\}/g, idText());
  const todayKey = (d) => { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const dayNumber = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
  const level = (id) => LEVELS.find((l) => l.id === Number(id));
  const stage = (key) => STAGES.find((s) => s.key === key);
  const practice = (id) => PRACTICES.find((p) => p.id === id);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  function doneOn(day) { return S.done[day] || []; }
  function recentlyDone(id, days) {
    for (let i = 0; i < days; i++) { const d = new Date(Date.now() - i * 86400000); if (doneOn(todayKey(d)).includes(id)) return true; }
    return false;
  }

  // Today's level rotates through 1..7, one per day.
  function todaysLevel() { return LEVELS[dayNumber() % 7] || LEVELS[0]; }
  function todaysPractice() {
    const lv = todaysLevel();
    let pool = PRACTICES.filter((p) => p.level === lv.id || (p.alsoLevels || []).includes(lv.id));
    if (S.stage) {
      const inStage = pool.filter((p) => p.stage === S.stage);
      if (inStage.length) pool = inStage.concat(pool.filter((p) => p.stage !== S.stage));
    }
    const light = pool.filter((p) => p.intensity !== "deep");
    if (light.length) pool = light; // daily drip stays gentle; deep work is chosen on purpose
    const fresh = pool.filter((p) => !recentlyDone(p.id, 10));
    const list = fresh.length ? fresh : pool;
    if (!list.length) return null;
    return list[hash(todayKey()) % list.length];
  }
  // A level answer as a reminder line ("What I see: golden light…"); older I-statements stay as they are
  const levelLine = (l, v) => (/^(i|through)\b/i.test(v) ? v : l.facet + ": " + v);
  function returnLine() {
    const pool = RETURNS.slice();
    if (S.identity) {
      LEVELS.forEach((l) => { const v = S.identity.levels && S.identity.levels[l.id]; if (v) pool.push(levelLine(l, v)); });
    }
    const slot = Math.floor(Date.now() / (1000 * 60 * 60 * 3)); // changes every 3 hours
    return pool[hash(String(slot)) % pool.length];
  }

  // ---------- Router ----------
  const routes = [];
  function route(pattern, fn, opts) { routes.push({ re: new RegExp("^" + pattern + "$"), fn, opts: opts || {} }); }
  function go(h) { location.hash = h; }
  function render() {
    const h = (location.hash || "#/").slice(1) || "/";
    if (!S.identity && !/^\/(session|welcome|more|backup|reminders)/.test(h)) { go("#/welcome"); return; }
    for (const r of routes) {
      const m = h.match(r.re);
      if (m) {
        $("#tabs").classList.toggle("hide", !!r.opts.noTabs);
        document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === r.opts.tab));
        view.innerHTML = "";
        r.fn.apply(null, m.slice(1));
        window.scrollTo(0, 0);
        view.focus({ preventScroll: true });
        return;
      }
    }
    go("#/");
  }
  // ---------- Views ----------

  // Welcome
  route("/welcome", () => {
    view.innerHTML = `
      <div class="fade-in" style="padding-top:8vh">
        <div class="eyebrow">${esc(SX.methodName || "ID7")}</div>
        <h1>Welcome to ID7</h1>
        <p class="prompt muted">Your current identity is your baseline. Left alone, you return to it.</p>
        <p class="muted">ID7 helps you keep coming back to your next-level identity, through all 7 levels of I AM, until it becomes your new normal.</p>
        <div class="card">
          <p class="faint" style="margin:0">ID7 is a personal practice tool, not therapy or a substitute for mental-health care. Go at your own pace, and stop any practice whenever you need to.</p>
        </div>
        <div class="btns">
          <a class="btn" href="#/session">Begin your Identity Session</a>
          <a class="btn quiet" href="#/backup">Restore from a backup</a>
        </div>
      </div>`;
  }, { noTabs: true });

  // Identity Session (steps are built in setContent)
  route("/session(?:/(\\d+))?", (n) => {
    if (!S.draft) S.draft = { step: 0, intake: {}, statement: S.identity ? S.identity.statement : "", sketch: S.identity ? (S.identity.sketch || S.identity.statement) : "", levels: Object.assign({}, S.identity && S.identity.levels), switchCue: S.identity ? S.identity.switchCue : "" };
    const d = S.draft;
    let i = n != null ? Math.min(Number(n), SESSION.length - 1) : d.step;
    d.step = i; save();
    const st = SESSION[i];
    const pct = Math.round((i / (SESSION.length - 1)) * 100);
    const top = `
      <div class="topbar">
        <button class="link" id="back">${i ? "‹ Back" : (S.identity ? "‹ Exit" : "")}</button>
        <span class="faint">${i + 1} / ${SESSION.length}</span>
      </div>
      <div class="progress"><i style="width:${pct}%"></i></div>`;
    let body = "", canNext = () => true, onNext = () => {};

    if (st.kind === "intro") {
      body = `<div class="eyebrow">Identity Session</div>
        <h1>${esc(SX.introTitle)}</h1>
        ${SX.intro.map((t) => `<p class="muted">${esc(t)}</p>`).join("")}
        <p class="faint">${esc(SX.quote)}</p>`;
    } else if (st.kind === "text") {
      body = `<div class="eyebrow">${esc(st.eyebrow)}</div><p class="prompt">${esc(st.q)}</p>
        <textarea id="ans" placeholder="Write freely…">${esc(d.intake[st.key] || "")}</textarea>`;
      onNext = () => { d.intake[st.key] = $("#ans").value.trim(); };
    } else if (st.kind === "scale") {
      const v = d.intake[st.key] || 8;
      body = `<div class="eyebrow">${esc(st.eyebrow)}</div><p class="prompt">${esc(st.q)}</p>
        <div class="big-num" id="num">${v}</div>
        <input type="range" id="ans" min="1" max="10" value="${v}">
        <div class="scale"><span>1 · a little</span><span>10 · completely</span></div>`;
      onNext = () => { d.intake[st.key] = Number($("#ans").value); };
    } else if (st.kind === "sketch") {
      body = `<div class="eyebrow">Your next-level identity</div>
        <p class="prompt">${esc(SX.sketchQ)}</p>
        <p class="muted">${esc(SX.sketchHelp)}</p>
        ${d.intake.opens ? `<div class="card"><div class="faint">What opens for you</div><div>${esc(d.intake.opens)}</div></div>` : ""}
        <textarea id="ans" style="min-height:90px" placeholder="${esc(SX.sketchHint)}">${esc(d.sketch || "")}</textarea>`;
      canNext = () => $("#ans").value.trim().length > 2;
      onNext = () => { d.sketch = $("#ans").value.trim(); };
    } else if (st.kind === "identity") {
      const mine = LEVELS.filter((l) => d.levels[l.id]);
      body = `<div class="eyebrow">${esc(SX.iamEyebrow)}</div>
        <p class="prompt">${esc(SX.identityQ)}</p>
        <p class="muted">${esc(SX.identityHelp)}</p>
        <div class="card"><div class="faint">Your next-level self</div><div class="serif" style="color:var(--gold-2)">${esc(d.sketch || "")}</div>
          ${mine.map((l) => `<div class="faint" style="margin-top:10px">${esc(l.facet)}</div><div>${esc(d.levels[l.id])}</div>`).join("")}</div>
        <textarea id="ans" style="min-height:90px" placeholder="I am…">${esc(d.statement || "")}</textarea>
        <p class="faint">${esc(SX.identityExamples)}</p>`;
      canNext = () => $("#ans").value.trim().length > 2;
      onNext = () => { d.statement = $("#ans").value.trim(); };
    } else if (st.kind === "embody") {
      const E = SX.embody;
      body = `<div class="eyebrow">${esc(E.eyebrow)}</div>
        <h1>${esc(E.title)}</h1>
        <div class="card"><div class="faint">Your next-level identity</div><div class="serif" style="color:var(--gold-2);font-size:19px">${esc(d.sketch || d.statement)}</div></div>
        <div class="breath" aria-hidden="true"><i></i></div>
        ${E.lines.map((t, k) => `<p class="${k ? "muted" : "prompt"}">${esc(t)}</p>`).join("")}`;
    } else if (st.kind === "level") {
      const l = level(st.level);
      const val = d.levels[l.id] || "";
      body = `<div class="eyebrow">Level ${l.id} of 7 · ${esc(l.name)}</div>
        <div class="card"><div class="faint">Your next-level identity</div><div class="serif" style="color:var(--gold-2);font-size:19px">${esc(d.sketch || d.statement)}</div></div>
        <p class="prompt">${esc(SX.levelAsk[l.id])}</p>
        <p class="faint">${esc(SX.levelHelp)}</p>
        <textarea id="ans" style="min-height:110px" placeholder="${esc(l.hint)}">${esc(val)}</textarea>`;
      onNext = () => { d.levels[l.id] = $("#ans").value.trim(); };
    } else if (st.kind === "switch") {
      const cues = SX.switchCues;
      body = `<div class="eyebrow">Identity Switch</div>
        <p class="prompt">Choose a small physical cue that takes you straight into your next-level self.</p>
        <p class="muted">Pick what feels right intuitively. You'll anchor it next, and use it any time you want to step back in.</p>
        <div id="cues">${cues.map((c) => `<button class="choice ${d.switchCue === c ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div>
        <label class="lbl">Or your own</label>
        <input type="text" id="own" placeholder="e.g. Three taps on my collarbone" value="${esc(cues.includes(d.switchCue) ? "" : (d.switchCue || ""))}">`;
      canNext = () => !!(d.switchCue || "").trim();
    } else if (st.kind === "close") {
      body = `<div class="eyebrow">Anchor it</div>
        <h2 class="identity">${esc(d.statement)}</h2>
        <p class="muted">Next you'll anchor your Identity Switch (<span class="serif">${esc(d.switchCue)}</span>). Tap three times after each statement.</p>
        <div class="card"><p class="serif" style="margin:0">${SX.closing.slice(0, -1).map(esc).join("<br>")}<br><span style="color:var(--gold)">${esc(SX.closing[SX.closing.length - 1])}</span></p></div>`;
    }

    const last = i === SESSION.length - 1;
    view.innerHTML = `<div class="fade-in">${top}${body}
      <div class="btns"><button class="btn" id="next">${last ? "Anchor my Identity Switch" : (i === 0 ? esc(SX.introButton || "Let's begin") : st.kind === "embody" ? esc(SX.embody.button) : "Continue")}</button>
      ${st.kind === "text" ? `<button class="btn quiet" id="skip">Skip this one</button>` : ""}</div></div>`;

    const nextBtn = $("#next");
    const refresh = () => { nextBtn.disabled = !canNext(); };
    if (st.kind === "scale") $("#ans").addEventListener("input", (e) => { $("#num").textContent = e.target.value; });
    if (st.kind === "identity" || st.kind === "sketch") $("#ans").addEventListener("input", refresh);
    if (st.kind === "switch") {
      view.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => {
        d.switchCue = b.dataset.c; $("#own").value = "";
        view.querySelectorAll(".choice").forEach((x) => x.classList.toggle("on", x === b)); refresh();
      }));
      $("#own").addEventListener("input", (e) => {
        d.switchCue = e.target.value; view.querySelectorAll(".choice").forEach((x) => x.classList.remove("on")); refresh();
      });
    }
    refresh();
    $("#back").addEventListener("click", () => {
      onNext(); save();
      if (i > 0) go("#/session/" + (i - 1)); else if (S.identity) { S.draft = null; save(); go("#/more"); }
    });
    const skip = $("#skip"); if (skip) skip.addEventListener("click", () => go("#/session/" + (i + 1)));
    nextBtn.addEventListener("click", () => {
      if (!canNext()) return;
      onNext(); save();
      if (!last) { go("#/session/" + (i + 1)); return; }
      // Save the identity
      if (S.identity && S.identity.statement && S.identity.statement !== d.statement) {
        S.past.unshift(Object.assign({ endedAt: new Date().toISOString() }, S.identity));
      }
      S.identity = { statement: d.statement, sketch: d.sketch, levels: d.levels, intake: d.intake, switchCue: d.switchCue, createdAt: (S.identity && S.identity.statement === d.statement) ? S.identity.createdAt : new Date().toISOString(), switchInstalled: false };
      S.draft = null; save();
      openSwitch(true);
    });
  }, { noTabs: true });

  // Identity Switch overlay
  function openSwitch(install) {
    const ov = $("#overlay");
    const steps = install ? SX.anchors : [null];
    const nowLine = SX.closing[2] || "", doneLine = SX.closing[SX.closing.length - 1] || "";
    let si = 0, taps = 0;
    function paint() {
      const anchoring = install && si < steps.length;
      const finished = install ? si >= steps.length : taps >= 3;
      if (finished) {
        if (install) { S.identity.switchInstalled = true; }
        S.switchCount = (S.switchCount || 0) + 1; save();
        ov.innerHTML = `<div class="fade-in">
          <div class="eyebrow">${install ? "Identity Switch anchored" : "You're here"}</div>
          <h1 class="identity" style="font-size:30px">${esc(idText())}</h1>
          <p class="serif muted" style="font-size:18px">${esc(nowLine)}</p>
          ${install ? `<p class="serif" style="color:var(--gold)">${esc(doneLine)}</p><p class="faint">Use your switch any time: before a decision, a hard moment, or just to come back.</p>` : `<p class="faint">See it through your own eyes. How incredible is it that this is my life?</p>`}
          <div class="btns" style="margin-top:28px"><button class="btn" id="ovdone">${install ? "Enter ID7" : "Return"}</button></div></div>`;
        $("#ovdone").addEventListener("click", () => { ov.hidden = true; ov.innerHTML = ""; if (install) go("#/"); else render(); });
        return;
      }
      ov.innerHTML = `
        <button class="link close" id="ovx">Close</button>
        <div class="eyebrow">${anchoring ? `Anchoring · ${si + 1} of 3` : "Identity Switch"}</div>
        <p class="prompt" style="max-width:420px">${anchoring ? esc(steps[si]) : esc(S.identity.switchCue || "Tap three times") + ", and step into " + '<span style="color:var(--gold-2)">' + esc(idText()) + "</span>"}</p>
        <div class="tapper" id="tap">${taps === 0 ? "Tap" : taps === 1 ? "Again" : "Once more"}</div>
        <div class="dots">${[0, 1, 2].map((k) => `<i class="${k < taps ? "on" : ""}"></i>`).join("")}</div>
        <p class="faint" style="margin-top:18px">${anchoring ? "Do your cue as you tap the circle: three times." : "Do your cue with your body as you tap."}</p>`;
      $("#ovx").addEventListener("click", () => { ov.hidden = true; ov.innerHTML = ""; if (install) { save(); go("#/"); } });
      $("#tap").addEventListener("click", (e) => {
        taps++;
        e.currentTarget.classList.add("pulse"); setTimeout(() => { const t = $("#tap"); if (t) t.classList.remove("pulse"); }, 220);
        if (navigator.vibrate) navigator.vibrate(30);
        if (taps >= 3) { setTimeout(() => { if (install) { si++; taps = 0; } paint(); }, 380); }
        else paint();
      });
    }
    ov.hidden = false; paint();
  }

  // Home / Today
  route("/", () => {
    const I = S.identity;
    const lv = todaysLevel();
    const p = todaysPractice();
    const iam = I.levels && I.levels[lv.id];
    const st = S.stage && stage(S.stage);
    const doneToday = p && doneOn(todayKey()).includes(p.id);
    const hr = new Date().getHours();
    const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
    view.innerHTML = `<div class="fade-in">
      <div class="eyebrow">${greet}</div>
      <div class="card glow">
        <div class="faint">My next-level identity</div>
        <div class="identity">${esc(I.statement)}</div>
        <button class="btn" id="switch" style="margin-top:10px">Identity Switch · step in</button>
      </div>

      <div class="card">
        <div class="eyebrow">Return</div>
        <p class="prompt" style="margin:0">${fill(returnLine())}</p>
      </div>

      <a class="card" href="#/level/${lv.id}">
        <div class="row"><span class="badge">${lv.id}</span>
          <div class="grow"><div class="eyebrow" style="margin:0">Today's level</div><div class="serif" style="font-size:19px">${esc(lv.name)}</div></div>
          <span class="chev">›</span></div>
        ${iam ? `<div class="faint" style="margin-top:12px">${esc(lv.facet)}</div><p class="serif" style="margin:2px 0 0;color:var(--gold-2)">${esc(iam)}</p>` : `<p class="faint" style="margin:12px 0 0">Add ${esc(lv.facet.toLowerCase())} →</p>`}
      </a>

      ${p ? `<a class="card" href="#/practice/${esc(p.id)}">
        <div class="eyebrow">Today's practice${doneToday ? " · done ✓" : ""}</div>
        <h2 style="margin-bottom:4px">${esc(p.title)}</h2>
        <p class="muted" style="margin-bottom:8px">${fill(p.summary || "")}</p>
        <span class="chip">${p.minutes || 5} min</span>${stage(p.stage) ? `<span class="chip">${esc(stage(p.stage).name)}</span>` : ""}
      </a>` : `<div class="card faint">Practices are loading…</div>`}

      <a class="card" href="#/wheel">
        <div class="row"><div class="grow">
          <div class="eyebrow" style="margin:0">Where you are on the wheel</div>
          <div class="serif" style="font-size:19px">${st ? esc(st.name) : "Check in"}</div></div><span class="chev">›</span></div>
      </a>

      <div class="btns two">
        <a class="btn ghost" href="#/celebrate">Celebrate</a>
        <a class="btn ghost" href="#/note">Journal</a>
      </div>
    </div>`;
    $("#switch").addEventListener("click", () => openSwitch(!I.switchInstalled));
  }, { tab: "home" });

  // Levels list
  route("/levels", () => {
    const I = S.identity;
    view.innerHTML = `<div class="fade-in">
      <div class="eyebrow">ID7</div><h1>The 7 Levels of I AM</h1>
      <p class="muted">Identity lives on every level at once. Change can begin at any of them and ripple through the whole system.</p>
      <div class="card list">${LEVELS.map((l) => {
        const n = PRACTICES.filter((p) => p.level === l.id).length;
        const mine = I.levels && I.levels[l.id];
        return `<a class="item" href="#/level/${l.id}"><span class="badge ${mine ? "fill" : ""}">${l.id}</span>
          <div class="grow"><div class="serif" style="font-size:18px">${esc(l.name)}</div>
          <div class="faint">${mine ? esc(mine) : esc(l.facet)}</div></div>
          <span class="faint">${n}</span><span class="chev">›</span></a>`;
      }).join("")}</div></div>`;
  }, { tab: "levels" });

  // One level
  route("/level/(\\d)", (id) => {
    const l = level(id); if (!l) return go("#/levels");
    const I = S.identity;
    const ps = PRACTICES.filter((p) => p.level === l.id);
    const also = PRACTICES.filter((p) => p.level !== l.id && (p.alsoLevels || []).includes(l.id));
    const item = (p) => `<a class="item" href="#/practice/${esc(p.id)}"><div class="grow">
      <div>${esc(p.title)}</div><div class="faint">${p.minutes || 5} min${stage(p.stage) ? " · " + esc(stage(p.stage).name) : ""}${p.intensity === "deep" ? " · deep" : ""}${recentlyDone(p.id, 7) ? " · ✓" : ""}</div></div><span class="chev">›</span></a>`;
    view.innerHTML = `<div class="fade-in">
      <button class="link" onclick="history.back()">‹ Levels</button>
      <div class="row" style="margin:6px 0 10px"><span class="badge fill">${l.id}</span><h1 style="margin:0">${esc(l.name)}</h1></div>
      ${l.blurb ? `<p class="muted">${esc(l.blurb)}</p>` : ""}
      <div class="card">
        <label class="lbl" style="margin-top:0">${esc(l.facet)}, as my next-level self</label>
        <textarea id="iam" style="min-height:80px" placeholder="${esc(l.hint)}">${esc((I.levels && I.levels[l.id]) || "")}</textarea>
        <div class="btns"><button class="btn small ghost" id="saveiam" style="justify-self:start">Save</button></div>
      </div>
      <h3>Practices</h3>
      <div class="card list">${ps.length ? ps.map(item).join("") : `<p class="faint" style="margin:0">No practices yet.</p>`}</div>
      ${also.length ? `<h3>Also touches this level</h3><div class="card list">${also.map(item).join("")}</div>` : ""}
    </div>`;
    $("#saveiam").addEventListener("click", () => {
      S.identity.levels = S.identity.levels || {};
      S.identity.levels[l.id] = $("#iam").value.trim(); save(); toast("Saved");
    });
  }, { tab: "levels" });

  // Practice
  route("/practice/([\\w-]+)", (id) => {
    const p = practice(id); if (!p) return go("#/");
    const l = level(p.level), st = stage(p.stage);
    const deep = p.intensity === "deep";
    const doneToday = doneOn(todayKey()).includes(p.id);
    view.innerHTML = `<div class="fade-in">
      <button class="link" onclick="history.back()">‹ Back</button>
      <div class="eyebrow" style="margin-top:6px">${l ? "Level " + l.id + " · " + esc(l.name) : ""}</div>
      <h1>${esc(p.title)}</h1>
      <div style="margin-bottom:10px"><span class="chip">${p.minutes || 5} min</span>${st ? `<span class="chip gold">${esc(st.name)}</span>` : ""}${deep ? `<span class="chip deep">deep work</span>` : ""}${doneToday ? `<span class="chip done">done today</span>` : ""}</div>
      <p class="prompt muted">${fill(p.summary || "")}</p>
      ${deep ? `<div class="care">${esc(p.care || "This is deeper work. Go gently, and stop whenever you need to. This is not therapy. Reach out for support if things feel overwhelming.")}</div>
        <div id="consent" class="card"><p style="margin-top:0">Are you ready and willing to do this practice now?</p>
        <div class="btns two" style="margin-top:6px"><button class="btn" id="yes">Yes, I'm ready</button><button class="btn quiet" onclick="history.back()">Not right now</button></div></div>` : ""}
      <div id="body" ${deep ? "hidden" : ""}>
        <div class="card"><ol class="steps">${(p.steps || []).map((s) => `<li>${fill(s)}</li>`).join("")}</ol></div>
        ${p.journalPrompt ? `<label class="lbl">${esc(p.journalPrompt)}</label>` : `<label class="lbl">Anything you noticed? (optional)</label>`}
        <textarea id="note" placeholder="Write a few words…"></textarea>
        <div class="btns"><button class="btn" id="done">${doneToday ? "Log it again" : "I did this"}</button></div>
      </div></div>`;
    if (deep) $("#yes").addEventListener("click", () => { $("#consent").hidden = true; $("#body").hidden = false; });
    view.querySelectorAll("ol.steps li").forEach((li) => li.addEventListener("click", () => li.classList.toggle("done")));
    $("#done").addEventListener("click", () => {
      const k = todayKey(); S.done[k] = S.done[k] || [];
      if (!S.done[k].includes(p.id)) S.done[k].push(p.id);
      const text = $("#note").value.trim();
      S.journal.unshift({ id: uid(), at: new Date().toISOString(), kind: "practice", practiceId: p.id, title: p.title, prompt: p.journalPrompt || "", text });
      save(); toast("Beautiful. Logged."); go("#/");
    });
  }, { tab: "levels" });

  // Wheel
  route("/wheel", () => {
    const n = STAGES.length;
    const pos = STAGES.map((s, k) => {
      const a = (-90 + (360 / n) * k) * Math.PI / 180;
      return { s, x: 50 + 38 * Math.cos(a), y: 50 + 38 * Math.sin(a) };
    });
    const cur = S.stage && stage(S.stage);
    const ps = cur ? PRACTICES.filter((p) => p.stage === cur.key) : [];
    view.innerHTML = `<div class="fade-in">
      <div class="eyebrow">A.A.L.I.G.N.</div><h1>Where are you on the wheel?</h1>
      <p class="muted">Transformation isn't a straight line. It's a spiral. We are always somewhere on the wheel, and every next level begins a new turn.</p>
      <div class="wheel"><div class="ring"></div>
        <div class="center"><div>${cur ? "You are in<br><b style='color:var(--gold)'>" + esc(cur.name) + "</b>" : "Tap the stage<br>that feels true"}</div></div>
        ${pos.map((o) => `<button data-k="${o.s.key}" class="${S.stage === o.s.key ? "on" : ""}" style="left:${o.x}%;top:${o.y}%">${esc(o.s.name)}</button>`).join("")}
      </div>
      <div id="detail"></div>
    </div>`;
    function detail(key) {
      const s = stage(key); if (!s) { $("#detail").innerHTML = ""; return; }
      const list = PRACTICES.filter((p) => p.stage === s.key);
      $("#detail").innerHTML = `<div class="card fade-in">
        <h2>${esc(s.name)}</h2>
        ${s.blurb ? `<p class="muted">${esc(s.blurb)}</p>` : ""}
        ${(s.signs || []).length ? `<div class="faint" style="margin-bottom:6px">You might be here if…</div><ul style="margin:0 0 12px;padding-left:20px">${s.signs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${S.stage === s.key ? `<span class="chip gold">This is where you are</span>` : `<button class="btn small" id="here">I'm here</button>`}
      </div>
      ${list.length ? `<h3>Practices for ${esc(s.name)}</h3><div class="card list">${list.map((p) => `<a class="item" href="#/practice/${esc(p.id)}"><div class="grow"><div>${esc(p.title)}</div><div class="faint">Level ${p.level} · ${p.minutes || 5} min${p.intensity === "deep" ? " · deep" : ""}</div></div><span class="chev">›</span></a>`).join("")}</div>` : ""}`;
      const here = $("#here");
      if (here) here.addEventListener("click", () => { S.stage = s.key; save(); toast("Noted: " + s.name); render(); });
    }
    view.querySelectorAll(".wheel button").forEach((b) => b.addEventListener("click", () => {
      view.querySelectorAll(".wheel button").forEach((x) => x.style.outline = x === b ? "2px solid var(--gold)" : "");
      detail(b.dataset.k);
    }));
    if (cur) detail(cur.key);
  }, { tab: "wheel" });

  // Journal
  route("/journal", () => {
    const items = S.journal;
    const kinds = { practice: "Practice", celebration: "Celebration", note: "Journal" };
    view.innerHTML = `<div class="fade-in">
      <div class="eyebrow">Evidence of who you're becoming</div><h1>Journal</h1>
      <div class="btns two" style="margin:0 0 16px"><a class="btn ghost" href="#/celebrate">Celebrate</a><a class="btn ghost" href="#/note">Write</a></div>
      <div class="card">${items.length ? items.map((e) => `<div class="entry">
        <div class="when">${fmtDate(e.at)} · ${kinds[e.kind] || ""}${e.title ? " · " + esc(e.title) : ""}</div>
        ${e.text ? `<div style="white-space:pre-wrap">${esc(e.text)}</div>` : `<div class="faint">Completed</div>`}
      </div>`).join("") : `<p class="faint" style="margin:0">Nothing here yet. Every practice, celebration and note you log will gather here as proof of your new identity.</p>`}</div>
    </div>`;
  }, { tab: "journal" });

  function writer(kind) {
    const cel = kind === "celebration";
    view.innerHTML = `<div class="fade-in">
      <button class="link" onclick="history.back()">‹ Back</button>
      <div class="eyebrow" style="margin-top:6px">${cel ? "Celebration" : "Journal"}</div>
      <h1>${cel ? "I did it as her" : "What's alive for you?"}</h1>
      <p class="muted">${cel ? "Name something you did, chose or felt as your next-level self, however small. Celebrating it teaches your system this identity is safe and real." : "Write anything: noticing, resistance, proof, gratitude."}</p>
      ${cel ? `<div class="card"><div class="faint">I am</div><div class="serif" style="color:var(--gold-2)">${esc(idText())}</div></div>` : ""}
      <textarea id="t" placeholder="${cel ? "Today I ___ as her…" : "Write freely…"}">${cel ? "Today I " : ""}</textarea>
      <div class="btns"><button class="btn" id="save">${cel ? "Celebrate it" : "Save"}</button></div></div>`;
    const t = $("#t"); t.focus(); t.setSelectionRange(t.value.length, t.value.length);
    $("#save").addEventListener("click", () => {
      const v = t.value.trim(); if (!v || v === "Today I") return toast("Write a few words first");
      S.journal.unshift({ id: uid(), at: new Date().toISOString(), kind, text: v }); save();
      toast(cel ? "Celebrated ✦" : "Saved"); go("#/journal");
    });
  }
  route("/celebrate", () => writer("celebration"), { tab: "journal" });
  route("/note", () => writer("note"), { tab: "journal" });

  // More
  route("/more", () => {
    view.innerHTML = `<div class="fade-in">
      <div class="eyebrow">ID7</div><h1>More</h1>
      <div class="card list">
        <a class="item" href="#/reminders"><div class="grow"><div>Reminders</div><div class="faint">Set up iPhone reminders with your statements</div></div><span class="chev">›</span></a>
        <a class="item" href="#/identity"><div class="grow"><div>My next-level identity</div><div class="faint">See it across all 7 levels</div></div><span class="chev">›</span></a>
        <a class="item" href="#/session/0" id="redo"><div class="grow"><div>Redo my Identity Session</div><div class="faint">Refine this identity or choose your next level</div></div><span class="chev">›</span></a>
        <a class="item" href="#/backup"><div class="grow"><div>Backup &amp; restore</div><div class="faint">Your data lives only on this phone</div></div><span class="chev">›</span></a>
      </div>
      <p class="faint">${esc(SX.credit || "")} A personal practice tool, not therapy or a substitute for mental-health care.</p>
    </div>`;
    $("#redo").addEventListener("click", () => { S.draft = null; save(); });
  }, { tab: "more" });

  // Identity summary
  route("/identity", () => {
    const I = S.identity;
    view.innerHTML = `<div class="fade-in">
      <button class="link" onclick="history.back()">‹ More</button>
      <div class="eyebrow" style="margin-top:6px">Since ${new Date(I.createdAt).toLocaleDateString()}</div>
      <h1 class="identity">${esc(I.statement)}</h1>
      <div class="card list">${LEVELS.map((l) => `<a class="item" href="#/level/${l.id}"><span class="badge ${I.levels && I.levels[l.id] ? "fill" : ""}">${l.id}</span><div class="grow"><div class="faint">${esc(l.name)}</div><div class="serif">${esc((I.levels && I.levels[l.id]) || "Not written yet")}</div></div></a>`).join("")}</div>
      <div class="card"><div class="faint">Identity Switch</div><div class="serif">${esc(I.switchCue || "Not set")}</div><div class="faint" style="margin-top:6px">Used ${S.switchCount || 0} times</div></div>
      ${I.intake && I.intake.one ? `<div class="card"><div class="faint">What you came to change</div><p style="margin:0">${esc(I.intake.one)}</p></div>` : ""}
      ${S.past.length ? `<h3>Past identities</h3><div class="card">${S.past.map((p) => `<div class="entry"><div class="when">${new Date(p.createdAt).toLocaleDateString()} to ${new Date(p.endedAt).toLocaleDateString()}</div><div class="serif">${esc(p.statement)}</div></div>`).join("")}</div>` : ""}
    </div>`;
  }, { tab: "more" });

  // Reminders (iPhone Shortcuts)
  function reminderLines() {
    const lines = [];
    if (S.identity) {
      lines.push(S.identity.statement);
      LEVELS.forEach((l) => { const v = S.identity.levels && S.identity.levels[l.id]; if (v) lines.push(levelLine(l, v)); });
      if (S.identity.switchCue) lines.push(S.identity.switchCue + ". Step in.");
    }
    RETURNS.forEach((r) => lines.push(fillPlain(r)));
    return lines.filter(Boolean).map((s) => s.replace(/\s*\n+\s*/g, " "));
  }
  route("/reminders", () => {
    const lines = reminderLines();
    const url = location.href.split("#")[0];
    view.innerHTML = `<div class="fade-in">
      <button class="link" onclick="history.back()">‹ More</button>
      <div class="eyebrow" style="margin-top:6px">Return, all day</div><h1>Reminders</h1>
      <p class="muted">Your iPhone's free <b>Shortcuts</b> app can send you one of your identity statements at the times you choose, every day. Set it up once and it runs on its own.</p>

      <div class="card">
        <h3>1 · Copy your statements</h3>
        <p class="faint">${lines.length} lines: your identity, your I AM statements, and return prompts. Copy again whenever you update them.</p>
        <div class="code" id="lines">${esc(lines.join("\n"))}</div>
        <div class="btns"><button class="btn" id="copy">Copy my statements</button></div>
      </div>

      <div class="card">
        <h3>2 · Build the shortcut (once)</h3>
        <ol class="howto">
          <li>Open the <b>Shortcuts</b> app → <b>Shortcuts</b> tab → tap <b>+</b>.</li>
          <li>Name it <b>ID7 Return</b> (tap the name at the top).</li>
          <li>Search actions for <b>Text</b> and add it. Tap inside the box and <b>Paste</b> your statements.</li>
          <li>Add <b>Split Text</b> and set it to split by <b>New Lines</b>.</li>
          <li>Add <b>Get Item from List</b> and change "First Item" to <b>Random Item</b>.</li>
          <li>Add <b>Show Notification</b>. Make the body the <b>Item from List</b> and the title <b>ID7</b>.</li>
          <li>Tap <b>Done</b>. Tap the shortcut once to test it.</li>
        </ol>
      </div>

      <div class="card">
        <h3>3 · Make it run on its own</h3>
        <ol class="howto">
          <li>In Shortcuts, go to the <b>Automation</b> tab → <b>+</b> (or <b>New Automation</b>).</li>
          <li>Choose <b>Time of Day</b>, pick a time (e.g. 8:00 am), and set it to <b>Daily</b>.</li>
          <li>Choose <b>Run Immediately</b> (and turn off "Notify When Run").</li>
          <li>Pick your <b>ID7 Return</b> shortcut → <b>Done</b>.</li>
          <li>Repeat for more times of day: morning, midday, afternoon, evening.</li>
        </ol>
        <p class="faint" style="margin-bottom:0">Want a fresh line each time? The shortcut picks a random statement on every run.</p>
      </div>

      <div class="card">
        <h3>Optional · open ID7 from the reminder</h3>
        <p class="faint">Add a second shortcut with the <b>Open URLs</b> action and this link, then put it on your Home Screen or in a widget:</p>
        <div class="code">${esc(url)}</div>
      </div>
      <p class="faint">Tip: when you change your identity or I AM statements, copy them again and paste over the Text in your shortcut.</p>
    </div>`;
    $("#copy").addEventListener("click", async () => {
      const text = lines.join("\n");
      try { await navigator.clipboard.writeText(text); toast("Copied. Now paste it in Shortcuts"); }
      catch (e) {
        const r = document.createRange(); r.selectNodeContents($("#lines"));
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        toast("Selected. Tap Copy");
      }
    });
  }, { tab: "more" });

  // Backup
  route("/backup", () => {
    view.innerHTML = `<div class="fade-in">
      <button class="link" onclick="history.back()">‹ Back</button>
      <div class="eyebrow" style="margin-top:6px">Your data</div><h1>Backup &amp; restore</h1>
      <p class="muted">Everything you write in ID7 is stored only on this phone. Make a backup now and then (e.g. save it to Notes or Files) so you never lose your journey.</p>
      <div class="card"><h3>Make a backup</h3>
        <div class="btns"><button class="btn" id="exp">Copy backup</button></div></div>
      <div class="card"><h3>Restore</h3><p class="faint">Paste a backup here. This replaces what's on this phone.</p>
        <textarea id="imp" placeholder="Paste backup…"></textarea>
        <div class="btns"><button class="btn ghost" id="doimp">Restore backup</button></div></div>
    </div>`;
    $("#exp").addEventListener("click", async () => {
      const data = JSON.stringify({ app: "ID7", v: 1, savedAt: new Date().toISOString(), data: S });
      try { await navigator.clipboard.writeText(data); toast("Backup copied. Paste it in Notes"); }
      catch (e) { $("#imp").value = data; toast("Copy the text in the box below"); }
    });
    $("#doimp").addEventListener("click", () => {
      try {
        const o = JSON.parse($("#imp").value);
        if (!o || o.app !== "ID7" || !o.data) throw new Error("not ID7");
        if (!confirm("Replace everything on this phone with this backup?")) return;
        S = Object.assign(blank(), o.data); save(); toast("Restored"); go("#/");
      } catch (e) { toast("That doesn't look like an ID7 backup"); }
    });
  }, { tab: "more" });

  // ---------- Unlock (encrypted content) ----------
  // content.enc.json = { v, iter, salt, iv, ct } (base64). AES-GCM 256, key from PBKDF2-SHA256.
  const KEYSTORE = "id7.k";
  const b64 = { from: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)), to: (u) => btoa(String.fromCharCode(...new Uint8Array(u))) };
  async function deriveKey(pass, pkg) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64.from(pkg.salt), iterations: pkg.iter }, base, 256);
    return new Uint8Array(bits);
  }
  async function decrypt(pkg, raw) {
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.from(pkg.iv) }, key, b64.from(pkg.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function fetchPkg() {
    const r = await fetch("content.enc.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("missing");
    return r.json();
  }
  function lockScreen(pkg, msg) {
    $("#tabs").classList.add("hide");
    view.innerHTML = `<div class="fade-in" style="padding-top:10vh;text-align:center">
      <img src="icons/icon-180.png" alt="" width="84" height="84" style="border-radius:20px;margin-bottom:18px">
      <h1>ID7</h1>
      <p class="muted">Enter your passcode to unlock.</p>
      <input type="password" id="pass" autocomplete="current-password" placeholder="Passcode" style="width:100%;text-align:center;background:rgba(0,0,0,.22);border:1px solid var(--line);border-radius:14px;padding:14px;font-size:17px">
      <p class="faint" id="msg" style="min-height:1.5em;margin-top:10px">${esc(msg || "You only need to do this once on this phone.")}</p>
      <div class="btns"><button class="btn" id="unlock">Unlock</button></div></div>`;
    const go_ = async () => {
      const btn = $("#unlock"); btn.disabled = true; $("#msg").textContent = "Unlocking…";
      try {
        const raw = await deriveKey($("#pass").value, pkg);
        const c = await decrypt(pkg, raw);
        try { localStorage.setItem(KEYSTORE, b64.to(raw) + "|" + pkg.salt); } catch (e) {}
        start(c);
      } catch (e) { btn.disabled = false; $("#msg").textContent = "That passcode didn't work. Try again."; }
    };
    $("#unlock").addEventListener("click", go_);
    $("#pass").addEventListener("keydown", (e) => { if (e.key === "Enter") go_(); });
    $("#pass").focus();
  }
  function start(c) {
    setContent(c);
    window.addEventListener("hashchange", render);
    render();
  }
  async function boot() {
    if (window.ID7_CONTENT) return start(window.ID7_CONTENT); // local development copy
    let pkg;
    try { pkg = await fetchPkg(); }
    catch (e) { view.innerHTML = `<p class="muted" style="padding-top:20vh;text-align:center">ID7 couldn't load. Check your connection and reopen.</p>`; return; }
    const saved = (() => { try { return localStorage.getItem(KEYSTORE); } catch (e) { return null; } })();
    if (saved) {
      const [k, salt] = saved.split("|");
      if (salt === pkg.salt) {
        try { return start(await decrypt(pkg, b64.from(k))); } catch (e) { /* fall through to passcode */ }
      }
    }
    lockScreen(pkg, saved ? "ID7 was updated. Enter your passcode once more." : "");
  }

  // ---------- Start ----------
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  boot();
})();
