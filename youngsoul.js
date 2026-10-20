/* Young Soul – pracovní list značky: milníky, kanban, deník a e-maily ze schránky @youngsoul.cz.
   Data: kolekce ys_milestones, ys_cards, ys_log, ys_mail v data.json (ys_mail plní Google Apps Script). */
(function(){
  const root = document.getElementById('viewYS');
  if (!root || !window.GHStore) return;
  const db = window.GHStore.db;
  const C = { ms: db.collection('ys_milestones'), cards: db.collection('ys_cards'), log: db.collection('ys_log'), mail: db.collection('ys_mail') };
  const S = { ms: [], cards: [], log: [], mail: [], editMs: null, showDoneMail: false, armed: null, pick: null, newDue: '', newText: '' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const shortD = s => { if (!s) return ''; const d = new Date(s.length === 10 ? s + 'T12:00:00' : s); return d.getDate() + '. ' + (d.getMonth() + 1) + '.'; };
  const COLS = [['idea', 'Nápad'], ['doing', 'Dělám'], ['done', 'Hotovo']];
  const todayStr = () => ymd(new Date());
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return ymd(x); };
  const dueState = due => !due ? '' : due < todayStr() ? 'late' : due <= addDays(todayStr(), 3) ? 'soon' : '';
  const items = db.collection('items');
  // připomínka v Úkolech a kalendáři (+ ranní přehled) na den termínu v 9:00
  async function syncReminder(card){
    const id = 'ys-' + card.id;
    if (card.due && card.col !== 'done' && !card._gone) await items.doc(id).set({ type: 'reminder', title: 'Young Soul: ' + card.title, date: card.due, time: '09:00', end: '', priority: 'normal', note: 'Termín realizace nápadu ze záložky Young Soul.', done: false, sample: false, source: 'youngsoul', cardId: card.id, createdAt: Date.now() });
    else await items.doc(id).delete();
  }
  const MONTHS = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];
  const dueBtn = (target, due) => `<button type="button" class="ys-dbtn${due ? '' : ' empty'}" data-pick="${target}" aria-label="Vybrat termín">${due ? shortD(due) + ' ' + due.slice(0, 4) : 'Vybrat datum'}</button>`;
  function picker(){
    const m = S.pick.month, y = m.getFullYear(), mo = m.getMonth(), t = todayStr();
    const sel = S.pick.target === 'new' ? S.newDue : (S.cards.find(c => c.id === S.pick.target) || {}).due || '';
    const first = new Date(y, mo, 1), start = new Date(y, mo, 1 - ((first.getDay() + 6) % 7));
    let cells = '';
    for (let i = 0; i < 42; i++) { const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), v = ymd(d);
      cells += `<button type="button" data-pday="${v}" class="${d.getMonth() !== mo ? 'out' : ''}${v === t ? ' today' : ''}${v === sel ? ' sel' : ''}"${v < t ? ' disabled' : ''}>${d.getDate()}</button>`; }
    const q = (label, v) => `<button type="button" class="ys-mini" data-pday="${v}">${label}</button>`;
    const plusM = d => { const x = new Date(d + 'T12:00:00'); x.setMonth(x.getMonth() + 1); return ymd(x); };
    return `<div class="ys-pick" role="dialog" aria-label="Vyber termín">
      <div class="ys-pick-h"><button type="button" class="ys-mini" data-pnav="-1" aria-label="Předchozí měsíc">‹</button><span>${MONTHS[mo]} ${y}</span><button type="button" class="ys-mini" data-pnav="1" aria-label="Další měsíc">›</button></div>
      <div class="ys-pick-g">${['Po','Út','St','Čt','Pá','So','Ne'].map(w => `<span class="w">${w}</span>`).join('')}${cells}</div>
      <div class="ys-pick-q">${q('Zítra', addDays(t, 1))}${q('Za týden', addDays(t, 7))}${q('Za měsíc', plusM(t))}${sel ? q('Bez termínu', '') : ''}<button type="button" class="ys-mini" data-pclose>Zavřít</button></div>
    </div>`;
  }
  async function setDue(target, v){
    S.pick = null;
    if (target === 'new') { S.newDue = v; return render(true); }
    const c = S.cards.find(x => x.id === target); if (!c) return render(true);
    await C.cards.doc(c.id).update({ due: v });
    await syncReminder({ ...c, due: v });
  }
  const pl = (n, one, few, many) => n + ' ' + (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

  const css = document.createElement('style');
  css.textContent = `
  .ys-sum{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
  @media (max-width:860px){.ys-sum{grid-template-columns:repeat(2,minmax(0,1fr))}}
  .ys-kan{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:12px}
  @media (max-width:760px){.ys-kan{grid-template-columns:minmax(0,1fr)}}
  .ys-col{background:var(--sunk);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px;min-width:0}
  .ys-col h3{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);display:flex;justify-content:space-between}
  .ys-card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:9px 10px;display:flex;flex-direction:column;gap:6px}
  .ys-card .t{font-weight:500;overflow-wrap:anywhere}
  .ys-card .acts{display:flex;gap:4px;flex-wrap:wrap}
  .ys-mini{border:1px solid var(--line);background:transparent;border-radius:6px;padding:2px 8px;font-size:12px;color:var(--muted);min-height:26px}
  .ys-mini.danger{color:var(--danger)} .ys-mini.armed{background:var(--danger);color:var(--surface);border-color:var(--danger)}
  .ys-add{display:flex;gap:6px} .ys-add input{flex:1;min-width:0;background:var(--surface);border:1px solid var(--line);border-radius:7px;padding:6px 8px}
  .ys-ms{padding:10px 14px;display:flex;flex-direction:column;gap:6px;cursor:pointer}
  .ys-ms+.ys-ms{border-top:1px solid var(--line)} .ys-ms:hover{background:var(--sunk)}
  .ys-ms .row{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
  .ys-bar{height:8px;background:var(--sunk);border-radius:4px;overflow:hidden} .ys-bar span{display:block;height:100%;background:var(--accent)}
  .ys-bar.full span{background:var(--ok)}
  .ys-mail{padding:10px 14px;display:flex;flex-direction:column;gap:4px}
  .ys-mail+.ys-mail{border-top:1px solid var(--line)} .ys-mail.unread .subj{font-weight:600}
  .ys-mail.handled{opacity:.6}
  .ys-mail .subj{overflow-wrap:anywhere} .ys-mail .snip{color:var(--muted);font-size:13px;overflow-wrap:anywhere}
  .ys-log{padding:10px 14px;display:flex;flex-direction:column;gap:2px} .ys-log+.ys-log{border-top:1px solid var(--line)}
  .ys-log .d{font-family:var(--f-mono);font-size:12px;color:var(--muted)} .ys-log .x{white-space:pre-wrap;overflow-wrap:anywhere}
  .ys-form{padding:12px 14px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:8px}
  .ys-hint{padding:10px 14px;font-size:13px;color:var(--muted)}
  .ys-add{flex-wrap:wrap} .ys-add input[type=text]{flex:1 1 100%}
  .ys-add input[type=date]{flex:1 1 auto}
  .ys-due{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
  .ys-due input{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:2px 6px;min-height:28px;font:inherit;color:var(--fg)}
  .ys-card.late{border-color:var(--danger)} .ys-card.soon{border-color:var(--remind)}
  .chip.soon{background:var(--remind-soft);color:var(--remind)}
  .ys-dbtn{border:1px solid var(--line);background:var(--surface);border-radius:6px;padding:3px 8px;min-height:30px;font-size:12.5px;color:var(--fg);font-family:var(--f-mono)}
  .ys-dbtn.empty{color:var(--muted);font-family:inherit}
  .ys-pick{border:1px solid var(--line);border-radius:8px;background:var(--surface);padding:8px;display:flex;flex-direction:column;gap:6px;width:100%;max-width:300px}
  .ys-pick-h{display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:13px}
  .ys-pick-g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
  .ys-pick-g .w{font-size:10.5px;color:var(--muted);text-transform:uppercase;padding:2px 0}
  .ys-pick-g button{border:0;background:transparent;border-radius:6px;min-height:30px;font-family:var(--f-mono);font-size:12.5px;color:var(--fg)}
  .ys-pick-g button:hover{background:var(--sunk)} .ys-pick-g button.out{color:var(--muted);opacity:.5}
  .ys-pick-g button.today{outline:1px solid var(--accent)} .ys-pick-g button.sel{background:var(--accent);color:var(--on-accent)}
  .ys-pick-g button:disabled{opacity:.25}
  .ys-pick-q{display:flex;flex-wrap:wrap;gap:4px}
  `;
  document.head.appendChild(css);

  root.innerHTML = `
    <div class="ys-sum" id="ysSum"></div>
    <section class="panel" aria-labelledby="ysKanT">
      <div class="panel-h"><h2 id="ysKanT">Úkoly Young Soul</h2><span class="sub">Nápad → Dělám → Hotovo</span></div>
      <div class="ys-kan" id="ysKan"></div>
    </section>
    <div class="grid">
      <div class="col">
        <section class="panel" aria-labelledby="ysMsT">
          <div class="panel-h"><h2 id="ysMsT">Milníky</h2><button class="btn" type="button" id="ysMsAdd" style="min-height:32px;padding:4px 11px">Přidat milník</button></div>
          <form class="ys-form" id="ysMsForm" hidden autocomplete="off">
            <div class="add-row">
              <div class="field grow"><label for="ysMsName">Milník</label><input id="ysMsName" required maxlength="120" placeholder="např. Spuštění webu youngsoul.cz"></div>
              <div class="field"><label for="ysMsDate">Termín</label><input id="ysMsDate" type="date"></div>
              <div class="field" style="width:96px"><label for="ysMsPct">Hotovo %</label><input id="ysMsPct" type="number" min="0" max="100" step="5" value="0"></div>
            </div>
            <div class="add-row">
              <div class="field grow"><label for="ysMsNote">Poznámka</label><input id="ysMsNote" maxlength="300"></div>
              <button class="btn primary" type="submit">Uložit</button>
              <button class="btn danger" type="button" id="ysMsDel" hidden>Smazat</button>
              <button class="btn ghost" type="button" id="ysMsCancel">Zrušit</button>
            </div>
          </form>
          <div id="ysMsList"></div>
        </section>
        <section class="panel" aria-labelledby="ysLogT">
          <div class="panel-h"><h2 id="ysLogT">Deník</h2><span class="sub">co se kdy udělalo</span></div>
          <form class="ys-form" id="ysLogForm" autocomplete="off">
            <div class="field"><label for="ysLogText">Nový zápis</label><textarea id="ysLogText" rows="2" maxlength="1000" placeholder="např. Objednány vzorky triček, domluvena schůzka s grafikem"></textarea></div>
            <div class="add-row"><button class="btn primary" type="submit">Zapsat</button></div>
          </form>
          <div id="ysLogList"></div>
        </section>
      </div>
      <div class="col">
        <section class="panel" aria-labelledby="ysMailT">
          <div class="panel-h"><h2 id="ysMailT">E-maily @youngsoul.cz</h2><button class="ys-mini" type="button" id="ysMailToggle">Zobrazit vyřízené</button></div>
          <div id="ysMailList"></div>
        </section>
      </div>
    </div>`;
  const $ = s => root.querySelector(s);

  let pendingRender = false;
  root.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !typing()) { pendingRender = false; render(); } }, 0));
  const typing = () => { const a = document.activeElement; return a && root.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'button')); };
  function render(force){
    if (!force && typing()) { pendingRender = true; return; }
    // souhrn
    const avg = S.ms.length ? Math.round(S.ms.reduce((s, m) => s + (Number(m.pct) || 0), 0) / S.ms.length) : null;
    const doing = S.cards.filter(c => c.col === 'doing').length, idea = S.cards.filter(c => c.col === 'idea').length;
    const newMail = S.mail.filter(m => !m.handled).length;
    const lastLog = S.log.slice().sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    const nextMs = S.ms.filter(m => (Number(m.pct) || 0) < 100 && m.date).sort((a, b) => a.date.localeCompare(b.date))[0];
    $('#ysSum').innerHTML =
      `<div class="fs"><div class="k">Celkový progress</div><div class="v">${avg == null ? '—' : avg + ' %'}</div><div class="s">${pl(S.ms.length, 'milník', 'milníky', 'milníků')}${nextMs ? ' · další: ' + esc(nextMs.name) + ' ' + shortD(nextMs.date) : ''}</div></div>` +
      `<div class="fs"><div class="k">Rozpracováno</div><div class="v">${doing}</div><div class="s">${pl(idea, 'nápad čeká', 'nápady čekají', 'nápadů čeká')}</div></div>` +
      `<div class="fs"><div class="k">Nevyřízené e-maily</div><div class="v">${newMail}</div><div class="s">ze schránky @youngsoul.cz</div></div>` +
      `<div class="fs"><div class="k">Poslední zápis</div><div class="v">${lastLog ? shortD(ymd(new Date(lastLog.at))) : '—'}</div><div class="s">${lastLog ? esc(String(lastLog.text).slice(0, 60)) : 'deník je zatím prázdný'}</div></div>`;

    // kanban
    $('#ysKan').innerHTML = COLS.map(([k, label]) => {
      const cards = S.cards.filter(c => (c.col || 'idea') === k).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.createdAt || 0) - (b.createdAt || 0));
      return `<div class="ys-col" data-col="${k}"><h3><span>${label}</span><span class="mono">${cards.length}</span></h3>
        ${k === 'idea' ? `<form class="ys-add" data-addcard><input type="text" aria-label="Nový nápad" placeholder="Nový nápad…" maxlength="160" value="${esc(S.newText)}"><span class="ys-due">Zrealizovat do ${dueBtn('new', S.newDue)}</span><button class="ys-mini" type="submit">Přidat</button></form>${S.pick && S.pick.target === 'new' ? picker() : ''}` : ''}
        ${cards.map(c => { const st = k !== 'done' ? dueState(c.due) : ''; return `<div class="ys-card ${st}">
          <div class="t">${esc(c.title)}</div>
          ${st === 'late' ? '<span class="chip late" style="align-self:flex-start">Po termínu</span>' : st === 'soon' ? '<span class="chip soon" style="align-self:flex-start">Blíží se termín</span>' : ''}
          ${c.note ? `<div class="note" style="margin:0">${esc(c.note)}</div>` : ''}
          ${c.mailUrl ? `<div class="meta" style="margin:0"><a href="${esc(c.mailUrl)}" target="_blank" rel="noopener">e-mail</a></div>` : ''}
          ${k !== 'done' ? `<span class="ys-due">Zrealizovat do ${dueBtn(c.id, c.due)}</span>${S.pick && S.pick.target === c.id ? picker() : ''}` : (c.due ? `<div class="meta" style="margin:0">termín byl ${shortD(c.due)}</div>` : '')}
          <div class="acts">
            ${k !== 'idea' ? `<button class="ys-mini" data-mv="${c.id}" data-to="${k === 'done' ? 'doing' : 'idea'}" aria-label="Posunout zpět">←</button>` : ''}
            ${k !== 'done' ? `<button class="ys-mini" data-mv="${c.id}" data-to="${k === 'idea' ? 'doing' : 'done'}" aria-label="Posunout dál">→</button>` : ''}
            <button class="ys-mini danger${S.armed === c.id ? ' armed' : ''}" data-delcard="${c.id}">${S.armed === c.id ? 'Opravdu smazat?' : 'Smazat'}</button>
          </div></div>`; }).join('') || (k === 'idea' ? '' : '<div class="ys-hint" style="padding:4px 2px">Zatím nic.</div>')}
      </div>`;
    }).join('');

    // milníky
    const ms = S.ms.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    $('#ysMsList').innerHTML = ms.length ? ms.map(m => { const p = Math.max(0, Math.min(100, Number(m.pct) || 0));
      return `<div class="ys-ms" data-ms="${m.id}" tabindex="0" role="button" aria-label="Upravit milník ${esc(m.name)}">
        <div class="row"><span class="pname">${esc(m.name)}</span><span class="mono">${p} %</span></div>
        <div class="ys-bar${p >= 100 ? ' full' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><span style="width:${p}%"></span></div>
        ${m.date || m.note ? `<div class="meta" style="margin:0">${m.date ? 'termín ' + shortD(m.date) : ''}${m.note ? ' · ' + esc(m.note) : ''}</div>` : ''}
      </div>`; }).join('') : `<div class="empty">Žádné milníky. Přidej první, např. „Spuštění webu“ nebo „První kolekce“.</div>`;

    // deník
    const logs = S.log.slice().sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 30);
    $('#ysLogList').innerHTML = logs.map(l => `<div class="ys-log"><span class="d">${shortD(ymd(new Date(l.at)))} ${pad(new Date(l.at).getHours())}:${pad(new Date(l.at).getMinutes())}</span><span class="x">${esc(l.text)}</span></div>`).join('');

    // e-maily
    const mails = S.mail.filter(m => S.showDoneMail || !m.handled).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    $('#ysMailToggle').textContent = S.showDoneMail ? 'Skrýt vyřízené' : 'Zobrazit vyřízené';
    $('#ysMailList').innerHTML = mails.length ? mails.map(m => `<div class="ys-mail${m.unread ? ' unread' : ''}${m.handled ? ' handled' : ''}">
        <div class="meta" style="margin:0"><span>${esc(m.from)}</span><span class="mono">${shortD(m.date)}</span>${m.handled ? '<span class="chip">vyřízeno</span>' : ''}</div>
        <div class="subj">${esc(m.subject || '(bez předmětu)')}</div>
        ${m.snippet ? `<div class="snip">${esc(m.snippet)}</div>` : ''}
        <div class="acts" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">
          ${m.cardId ? '<span class="chip">úkol vytvořen</span>' : `<button class="ys-mini" data-mailcard="${m.id}">Vytvořit úkol</button>`}
          <button class="ys-mini" data-maildone="${m.id}">${m.handled ? 'Vrátit' : 'Vyřízeno'}</button>
          ${m.url ? `<a class="ys-mini" style="text-decoration:none" href="${esc(m.url)}" target="_blank" rel="noopener">Otevřít v Gmailu</a>` : ''}
        </div></div>`).join('')
      : `<div class="empty">${S.mail.length ? 'Všechno vyřízeno.' : 'Zatím žádné e-maily. Po nastavení přeposílání z @youngsoul.cz a skriptu se sem budou každou hodinu doplňovat.'}</div>`;
  }

  // ---- akce ----
  const now = () => Date.now();
  root.addEventListener('submit', async e => {
    e.preventDefault();
    if (e.target.matches('[data-addcard]')) {
      const inp = e.target.querySelector('input[type=text]'); const t = inp.value.trim(); if (!t) return;
      const card = { title: t, col: 'idea', due: S.newDue || '', createdAt: now() };
      const ref = await C.cards.add(card); if (card.due) await syncReminder({ ...card, id: ref.id });
      inp.value = ''; S.newText = ''; S.newDue = ''; S.pick = null; render(true); root.querySelector('[data-addcard] input[type=text]').focus();
    } else if (e.target.id === 'ysMsForm') {
      const obj = { name: $('#ysMsName').value.trim(), date: $('#ysMsDate').value, pct: Math.max(0, Math.min(100, Number($('#ysMsPct').value) || 0)), note: $('#ysMsNote').value.trim() };
      if (!obj.name) return;
      if (S.editMs) await C.ms.doc(S.editMs).update(obj); else await C.ms.add({ ...obj, createdAt: now() });
      closeMs();
    } else if (e.target.id === 'ysLogForm') {
      const t = $('#ysLogText').value.trim(); if (!t) return;
      await C.log.add({ text: t, at: now() }); $('#ysLogText').value = '';
    }
  });
  function openMs(m){ S.editMs = m ? m.id : null; $('#ysMsForm').hidden = false; $('#ysMsName').value = m?.name || ''; $('#ysMsDate').value = m?.date || ''; $('#ysMsPct').value = m?.pct ?? 0; $('#ysMsNote').value = m?.note || ''; $('#ysMsDel').hidden = !m; $('#ysMsDel').textContent = 'Smazat'; $('#ysMsDel').classList.remove('armed'); $('#ysMsName').focus(); }
  function closeMs(){ S.editMs = null; $('#ysMsForm').hidden = true; }
  root.addEventListener('click', async e => {
    const b = e.target.closest('button, [data-ms]'); if (!b) return;
    if (b.dataset.pick) { const tg = b.dataset.pick; if (S.pick && S.pick.target === tg) { S.pick = null; return render(true); } const cur = tg === 'new' ? S.newDue : (S.cards.find(c => c.id === tg) || {}).due; const base = cur ? new Date(cur + 'T12:00:00') : new Date(); S.pick = { target: tg, month: new Date(base.getFullYear(), base.getMonth(), 1) }; return render(true); }
    if (b.dataset.pnav) { const m = S.pick.month; S.pick.month = new Date(m.getFullYear(), m.getMonth() + Number(b.dataset.pnav), 1); return render(true); }
    if (b.dataset.pday !== undefined) return setDue(S.pick.target, b.dataset.pday);
    if (b.hasAttribute('data-pclose')) { S.pick = null; return render(true); }
    if (b.id === 'ysMsAdd') return openMs(null);
    if (b.id === 'ysMsCancel') return closeMs();
    if (b.id === 'ysMsDel') { if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Opravdu smazat?'; return; } await C.ms.doc(S.editMs).delete(); return closeMs(); }
    if (b.id === 'ysMailToggle') { S.showDoneMail = !S.showDoneMail; return render(true); }
    if (b.dataset.ms) return openMs(S.ms.find(m => m.id === b.dataset.ms));
    if (b.dataset.mv) { const c = S.cards.find(x => x.id === b.dataset.mv); await C.cards.doc(c.id).update({ col: b.dataset.to, movedAt: now() }); if (c.due) await syncReminder({ ...c, col: b.dataset.to }); return; }
    if (b.dataset.delcard) { if (S.armed !== b.dataset.delcard) { S.armed = b.dataset.delcard; return render(true); } S.armed = null; const c = S.cards.find(x => x.id === b.dataset.delcard); await C.cards.doc(c.id).delete(); if (c.due) await syncReminder({ ...c, _gone: true }); return; }
    if (b.dataset.mailcard) {
      const m = S.mail.find(x => x.id === b.dataset.mailcard);
      const ref = await C.cards.add({ title: m.subject || 'E-mail od ' + m.from, note: 'Od: ' + m.from, col: 'idea', mailUrl: m.url || '', createdAt: now() });
      return C.mail.doc(m.id).update({ cardId: ref.id });
    }
    if (b.dataset.maildone) { const m = S.mail.find(x => x.id === b.dataset.maildone); return C.mail.doc(m.id).update({ handled: !m.handled }); }
  });
  root.addEventListener('input', e => { if (e.target.closest('[data-addcard]')) S.newText = e.target.value; });
  root.addEventListener('keydown', e => { const r = e.target.closest && e.target.closest('[data-ms]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openMs(S.ms.find(m => m.id === r.dataset.ms)); } });

  const list = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
  C.ms.onSnapshot(s => { S.ms = list(s); render(); });
  C.cards.onSnapshot(s => { S.cards = list(s); render(); });
  C.log.onSnapshot(s => { S.log = list(s); render(); });
  C.mail.onSnapshot(s => { S.mail = list(s); render(); });
  render(true);
})();
