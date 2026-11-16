/* James Dean – pracovní úkoly ze zaměstnání.
   Úkoly se ukládají do společné kolekce items s area:'jd', takže se zobrazí i v Úkolech a kalendáři
   a v ranním přehledu. */
(function(){
  const root = document.getElementById('viewJD');
  if (!root || !window.GHStore) return;
  const items = window.GHStore.db.collection('items');
  const S = { all: [], pick: null, newDue: '', newText: '', newTime: '', newPrio: 'normal', armed: null, showDone: false, editDue: null };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayStr = () => ymd(new Date());
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return ymd(x); };
  const DOW = ['neděle','pondělí','úterý','středa','čtvrtek','pátek','sobota'];
  const MONTHS = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];
  const shortD = s => { const d = new Date(s + 'T12:00:00'); return d.getDate() + '. ' + (d.getMonth() + 1) + '.'; };
  const labelD = s => { const t = todayStr(); if (s === t) return 'dnes'; if (s === addDays(t, 1)) return 'zítra'; return DOW[new Date(s + 'T12:00:00').getDay()] + ' ' + shortD(s); };

  const css = document.createElement('style');
  css.textContent = `
  .jd-add{padding:12px 14px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:8px}
  .jd-add input[type=text]{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:7px;padding:8px 10px;font:inherit;color:var(--fg)}
  .jd-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .jd-lbl{font-size:12px;color:var(--muted)}
  .jd-b{border:1px solid var(--line);background:var(--surface);border-radius:6px;padding:3px 9px;min-height:30px;font-size:12.5px;color:var(--fg)}
  .jd-b.on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
  .jd-b.muted{color:var(--muted)} .jd-b.danger{color:var(--danger)} .jd-b.armed{background:var(--danger);color:var(--surface);border-color:var(--danger)}
  .jd-time{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:3px 6px;min-height:30px;width:70px;font-family:var(--f-mono);font-size:12.5px;color:var(--fg)}
  .jd-grp{padding:6px 14px 2px;font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
  .jd-grp.late{color:var(--danger)}
  .jd-it{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:start;padding:9px 14px}
  .jd-it+.jd-it{border-top:1px solid var(--line)}
  .jd-it .t{overflow-wrap:anywhere} .jd-it.done .t{text-decoration:line-through;color:var(--muted)}
  .jd-it .m{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:3px;font-size:12px;color:var(--muted)}
  .jd-it .a{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
  .jd-chk{width:22px;height:22px;border:1.5px solid var(--line);border-radius:6px;background:var(--surface);display:grid;place-items:center;padding:0;color:var(--on-accent)}
  .jd-chk[aria-checked=true]{background:var(--accent);border-color:var(--accent)}
  .jd-pick{border:1px solid var(--line);border-radius:8px;background:var(--surface);padding:8px;display:flex;flex-direction:column;gap:6px;max-width:300px;margin:4px 14px 10px}
  .jd-add .jd-pick{margin:0}
  .jd-pick-h{display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:13px}
  .jd-pick-g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
  .jd-pick-g .w{font-size:10.5px;color:var(--muted);text-transform:uppercase;padding:2px 0}
  .jd-pick-g button{border:0;background:transparent;border-radius:6px;min-height:30px;font-family:var(--f-mono);font-size:12.5px;color:var(--fg)}
  .jd-pick-g button:hover{background:var(--sunk)} .jd-pick-g button.out{opacity:.45}
  .jd-pick-g button.today{outline:1px solid var(--accent)} .jd-pick-g button.sel{background:var(--accent);color:var(--on-accent)}
  .jd-pick-g button:disabled{opacity:.2}
  `;
  document.head.appendChild(css);

  root.innerHTML = `
    <section class="panel" aria-labelledby="jdT">
      <div class="panel-h"><h2 id="jdT">James Dean – pracovní úkoly</h2><span class="sub" id="jdSub"></span></div>
      <div id="jdForm"></div>
      <div id="jdList"></div>
      <div style="padding:8px 14px 12px"><button class="jd-b muted" type="button" id="jdDoneT"></button></div>
    </section>`;
  const $ = s => root.querySelector(s);

  function picker(target){
    const m = S.pick.month, y = m.getFullYear(), mo = m.getMonth(), t = todayStr();
    const sel = target === 'new' ? S.newDue : (S.all.find(i => i.id === target) || {}).date || '';
    const first = new Date(y, mo, 1), start = new Date(y, mo, 1 - ((first.getDay() + 6) % 7));
    let cells = '';
    for (let i = 0; i < 42; i++) { const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), v = ymd(d);
      cells += `<button type="button" data-pday="${v}" class="${d.getMonth() !== mo ? 'out' : ''}${v === t ? ' today' : ''}${v === sel ? ' sel' : ''}"${v < t ? ' disabled' : ''}>${d.getDate()}</button>`; }
    return `<div class="jd-pick" role="dialog" aria-label="Vyber datum">
      <div class="jd-pick-h"><button type="button" class="jd-b" data-pnav="-1" aria-label="Předchozí měsíc">‹</button><span>${MONTHS[mo]} ${y}</span><button type="button" class="jd-b" data-pnav="1" aria-label="Další měsíc">›</button></div>
      <div class="jd-pick-g">${['Po','Út','St','Čt','Pá','So','Ne'].map(w => `<span class="w">${w}</span>`).join('')}${cells}</div>
      <div class="jd-row">${sel ? '<button type="button" class="jd-b muted" data-pday="">Bez data</button>' : ''}<button type="button" class="jd-b muted" data-pclose>Zavřít</button></div>
    </div>`;
  }
  const openPick = (target, cur) => { const b = cur ? new Date(cur + 'T12:00:00') : new Date(); S.pick = { target, month: new Date(b.getFullYear(), b.getMonth(), 1) }; };

  function renderForm(){
    const t = todayStr(), q = (lbl, v) => `<button type="button" class="jd-b${S.newDue === v ? ' on' : ''}" data-q="${v}">${lbl}</button>`;
    const other = S.newDue && ![t, addDays(t, 1)].includes(S.newDue);
    $('#jdForm').innerHTML = `<form class="jd-add" autocomplete="off">
      <input type="text" id="jdTitle" aria-label="Nový pracovní úkol" placeholder="Nový úkol pro James Dean…" maxlength="160" value="${esc(S.newText)}">
      <div class="jd-row"><span class="jd-lbl">Kdy</span>${q('Dnes', t)}${q('Zítra', addDays(t, 1))}<button type="button" class="jd-b${other ? ' on' : ''}" data-pick="new">${other ? labelD(S.newDue) : 'Jiné datum'}</button>${q('Bez data', '')}
        <span class="jd-lbl" style="margin-left:6px">Čas</span><input class="jd-time" id="jdTime" type="text" inputmode="numeric" placeholder="--:--" maxlength="5" value="${esc(S.newTime)}" aria-label="Čas (nepovinné)"></div>
      ${S.pick && S.pick.target === 'new' ? picker('new') : ''}
      <div class="jd-row"><button type="button" class="jd-b${S.newPrio === 'high' ? ' on' : ''}" data-prio>Vysoká priorita</button><span style="flex:1"></span><button class="btn primary" type="submit">Přidat úkol</button></div>
    </form>`;
  }

  function itemRow(i){
    const t = todayStr(), late = !i.done && i.date && i.date < t;
    const armed = S.armed === i.id;
    return `<div class="jd-it${i.done ? ' done' : ''}">
      <button type="button" class="jd-chk" role="checkbox" aria-checked="${!!i.done}" data-done="${i.id}" aria-label="Hotovo: ${esc(i.title)}">${i.done ? '✓' : ''}</button>
      <div><div class="t">${esc(i.title)}</div>
        <div class="m">${i.date ? `<span class="mono">${labelD(i.date)}${i.time ? ' ' + esc(i.time) : ''}</span>` : '<span>bez data</span>'}
        ${i.priority === 'high' && !i.done ? '<span class="chip hi">Vysoká priorita</span>' : ''}${late ? '<span class="chip late">Po termínu</span>' : ''}</div></div>
      <div class="a">${i.done ? '' : `<button type="button" class="jd-b muted" data-pick="${i.id}" aria-label="Změnit datum">Datum</button>`}
        <button type="button" class="jd-b danger${armed ? ' armed' : ''}" data-del="${i.id}">${armed ? 'Opravdu?' : 'Smazat'}</button></div>
    </div>${S.pick && S.pick.target === i.id ? picker(i.id) : ''}`;
  }

  function render(force){
    const a = document.activeElement;
    if (!force && a && root.contains(a) && a.tagName === 'INPUT') { pending = true; return; }
    renderForm();
    const t = todayStr(), tm = addDays(t, 1), wk = addDays(t, 7);
    const open = S.all.filter(i => !i.done).sort((x, y) => (x.date || '9999').localeCompare(y.date || '9999') || (x.time || '99').localeCompare(y.time || '99') || (x.createdAt || 0) - (y.createdAt || 0));
    const groups = [['Po termínu', i => i.date && i.date < t, 'late'], ['Dnes', i => i.date === t], ['Zítra', i => i.date === tm],
      ['Tento týden', i => i.date > tm && i.date <= wk], ['Později', i => i.date > wk], ['Bez data', i => !i.date]];
    let html = '';
    groups.forEach(([n, f, c]) => { const g = open.filter(f); if (g.length) html += `<div class="jd-grp ${c || ''}">${n}</div>` + g.map(itemRow).join(''); });
    const done = S.all.filter(i => i.done).sort((x, y) => (y.doneAt || y._u || 0) - (x.doneAt || x._u || 0));
    if (S.showDone && done.length) html += '<div class="jd-grp">Hotovo</div>' + done.slice(0, 20).map(itemRow).join('');
    $('#jdList').innerHTML = html || '<div class="empty">Žádné otevřené úkoly. Přidej první nahoře.</div>';
    $('#jdSub').textContent = open.length + ' otevřených' + (open.filter(i => i.date === t).length ? ' · ' + open.filter(i => i.date === t).length + ' dnes' : '');
    $('#jdDoneT').textContent = S.showDone ? 'Skrýt hotové' : `Zobrazit hotové (${done.length})`;
    $('#jdDoneT').hidden = !done.length;
  }
  let pending = false;
  root.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (pending && !(a && root.contains(a) && a.tagName === 'INPUT')) { pending = false; render(); } }, 0));

  const normTime = v => { const m = String(v).trim().match(/^(\d{1,2})[:.]?(\d{2})?$/); if (!m) return ''; const h = +m[1], mi = +(m[2] || 0); return h < 24 && mi < 60 ? pad(h) + ':' + pad(mi) : ''; };

  root.addEventListener('input', e => { if (e.target.id === 'jdTitle') S.newText = e.target.value; if (e.target.id === 'jdTime') S.newTime = e.target.value; });
  root.addEventListener('submit', async e => {
    e.preventDefault();
    const title = S.newText.trim(); if (!title) return $('#jdTitle').focus();
    const time = normTime(S.newTime);
    await items.add({ type: 'task', area: 'jd', title, date: S.newDue, time, end: '', priority: S.newPrio, note: '', done: false, createdAt: Date.now() });
    S.newText = ''; S.newTime = ''; S.newPrio = 'normal'; S.pick = null;
    render(true); $('#jdTitle').focus();
  });
  root.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
    if (b.id === 'jdDoneT') { S.showDone = !S.showDone; return render(true); }
    if (b.dataset.q !== undefined) { S.newDue = b.dataset.q; S.pick = null; return render(true); }
    if (b.hasAttribute('data-prio')) { S.newPrio = S.newPrio === 'high' ? 'normal' : 'high'; return render(true); }
    if (b.dataset.pick) { const tg = b.dataset.pick; if (S.pick && S.pick.target === tg) S.pick = null; else openPick(tg, tg === 'new' ? S.newDue : (S.all.find(i => i.id === tg) || {}).date); return render(true); }
    if (b.dataset.pnav) { const m = S.pick.month; S.pick.month = new Date(m.getFullYear(), m.getMonth() + Number(b.dataset.pnav), 1); return render(true); }
    if (b.hasAttribute('data-pclose')) { S.pick = null; return render(true); }
    if (b.dataset.pday !== undefined) { const tg = S.pick.target, v = b.dataset.pday; S.pick = null;
      if (tg === 'new') { S.newDue = v; return render(true); }
      return items.doc(tg).update({ date: v }); }
    if (b.dataset.done) { const i = S.all.find(x => x.id === b.dataset.done); return items.doc(i.id).update({ done: !i.done, doneAt: i.done ? 0 : Date.now() }); }
    if (b.dataset.del) { if (S.armed !== b.dataset.del) { S.armed = b.dataset.del; return render(true); } S.armed = null; return items.doc(b.dataset.del).delete(); }
  });
  root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'jdTime') { e.preventDefault(); root.querySelector('form').requestSubmit(); } });

  items.onSnapshot(s => { S.all = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.area === 'jd'); render(); });
  render(true);
})();
