(() => {
  'use strict';

  const STORAGE_KEY = 'rirekisho_pdf_editor_data_v1';
  const BACKUP_KEY = 'rirekisho_pdf_editor_backup_v1';
  const CAREER_STORAGE_KEY = 'resume_pdf_editor_data_v1';
  const APP_VERSION = '1.2.0';
  const MAX_JSON_BYTES = 5 * 1024 * 1024;
  const EMPTY = {
    schemaVersion: 2,
    appVersion: APP_VERSION,
    exportedAt: '',
    meta: { title: '履 歴 書', date: '' },
    profile: { nameKana: '', name: '', birthDate: '', gender: '', photoDataUrl: '' },
    contact: { postalCode: '', addressKana: '', address: '', phone: '', email: '' },
    education: [], work: [], licenses: [],
    otherNotes: '', hobbies: '', remarks: '', motivation: '', preferences: '',
    layout: { educationBlankRows: 4, paper: 'a4' }
  };

  function select(selector, root = document) {
    return root.querySelector(selector);
  }

  function selectAll(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function text(value) {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return '';
  }

  function escapeHtml(value) {
    return text(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function normalizeRows(value) {
    if (!Array.isArray(value)) return [];
    if (value.length > 200) throw new Error('各一覧は200行以内にしてください。');
    const result = [];
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      result.push({ year: text(item.year), month: text(item.month), text: text(item.text) });
    }
    return result;
  }

  function normalize(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('JSONの最上位はオブジェクトにしてください。');
    }
    if (input.schemaVersion !== undefined && (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1 || input.schemaVersion > 2)) {
      throw new Error('対応していないJSONバージョンです。');
    }
    if (!input.profile && !input.education && !input.work) {
      throw new Error('履歴書用のJSONを選んでください。');
    }
    const result = clone(EMPTY);
    for (const group of ['meta', 'profile', 'contact']) {
      for (const key of Object.keys(result[group])) {
        if (input[group]?.[key] !== undefined) result[group][key] = text(input[group][key]);
      }
    }
    const photo = result.profile.photoDataUrl;
    if (photo && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)) {
      throw new Error('写真はJPEG・PNG・WebPの埋め込み画像のみ使用できます。');
    }
    for (const key of ['education', 'work', 'licenses']) result[key] = normalizeRows(input[key]);
    for (const key of ['otherNotes', 'hobbies', 'remarks', 'motivation', 'preferences', 'exportedAt']) result[key] = text(input[key]);
    const blankRows = Number(input.layout?.educationBlankRows);
    if (Number.isInteger(blankRows)) result.layout.educationBlankRows = Math.max(0, Math.min(6, blankRows));
    if (input.layout?.paper === 'a3') result.layout.paper = 'a3';
    return result;
  }

  let startupMessage = '未保存';
  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const restored = normalize(JSON.parse(saved));
        startupMessage = '保存データを復元しました';
        return restored;
      }
    } catch {
      startupMessage = '保存データを読めませんでした。元の保存データは保持しています。';
    }
    return clone(EMPTY);
  }

  let state = load();
  let saveTimer;
  let layoutFrame;

  function saveNow() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      select('#saveStatus').textContent = `保存済み ${new Date().toLocaleTimeString('ja-JP')}`;
      return true;
    } catch {
      select('#saveStatus').textContent = '保存失敗。JSONを書き出してバックアップしてください。';
      return false;
    }
  }

  function commit(rebuild = false) {
    if (rebuild) renderEditors();
    renderPreview();
    syncJson();
    clearTimeout(saveTimer);
    select('#saveStatus').textContent = '保存中…';
    saveTimer = setTimeout(saveNow, 220);
  }

  function syncJson() {
    select('#rawJson').value = JSON.stringify(state, null, 2);
  }

  function setField(element) {
    const keys = element.dataset.path.split('.');
    let target = state;
    for (const key of keys.slice(0, -1)) target = target[key];
    let value = element.value;
    if (element.dataset.path === 'layout.educationBlankRows') value = Math.max(0, Math.min(6, Number(value) || 0));
    target[keys[keys.length - 1]] = value;
    commit();
  }

  function renderEditors() {
    for (const element of selectAll('[data-path]')) {
      let value = state;
      for (const key of element.dataset.path.split('.')) value = value[key];
      element.value = value;
    }
    for (const [id, key, label] of [['educationEditor', 'education', '学歴'], ['workEditor', 'work', '職歴'], ['licensesEditor', 'licenses', '資格']]) {
      const root = select(`#${id}`);
      root.replaceChildren();
      state[key].forEach((item, index) => root.append(rowCard(item, index, key, label)));
    }
    const photo = select('#photoThumb');
    photo.style.visibility = 'hidden';
    photo.removeAttribute('src');
    if (state.profile.photoDataUrl) {
      photo.src = state.profile.photoDataUrl;
      photo.style.visibility = 'visible';
    }
  }

  function rowCard(item, index, key, label) {
    const card = document.createElement('div');
    card.className = 'item-card';
    const head = document.createElement('div');
    head.className = 'item-head';
    const title = document.createElement('span');
    title.className = 'item-title';
    title.textContent = `${label} ${index + 1}`;
    head.append(title);
    function button(caption, action) {
      const control = document.createElement('button');
      control.type = 'button';
      control.className = 'btn small';
      control.textContent = caption;
      control.addEventListener('click', action);
      head.append(control);
    }
    function move(direction) {
      const destination = index + direction;
      const list = state[key];
      if (destination < 0 || destination >= list.length) return;
      [list[index], list[destination]] = [list[destination], list[index]];
      commit(true);
    }
    button('↑', () => move(-1));
    button('↓', () => move(1));
    button('削除', () => {
      if (!confirm('この行を削除しますか？')) return;
      state[key].splice(index, 1);
      commit(true);
    });
    const fields = document.createElement('div');
    fields.className = 'grid-3';
    for (const [property, caption] of [['year', '年'], ['month', '月'], ['text', '内容']]) {
      const wrapper = document.createElement('div');
      wrapper.className = 'field';
      const fieldLabel = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `${key}-${index}-${property}`;
      input.value = item[property];
      input.autocomplete = 'off';
      fieldLabel.htmlFor = input.id;
      fieldLabel.textContent = caption;
      input.addEventListener('input', () => { item[property] = input.value; commit(); });
      wrapper.append(fieldLabel, input);
      fields.append(wrapper);
    }
    card.append(head, fields);
    return card;
  }

  function age() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(state.profile.birthDate)) return '';
    const birth = new Date(`${state.profile.birthDate}T00:00:00`);
    if (Number.isNaN(birth.getTime())) return '';
    let reference = new Date();
    const parts = state.meta.date.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (parts) reference = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    let years = reference.getFullYear() - birth.getFullYear();
    if (reference.getMonth() < birth.getMonth() || (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate())) years--;
    if (years < 0) return '';
    return String(years);
  }

  function formatBirth() {
    if (!state.profile.birthDate) return '';
    const parts = state.profile.birthDate.split('-');
    if (parts.length !== 3) return '';
    return `${parts[0]} 年 ${Number(parts[1])} 月 ${Number(parts[2])} 日`;
  }

  function blankRow() { return { year: '', month: '', text: '' }; }

  function makeHistory() {
    const result = [{ ...blankRow(), text: '学 歴', heading: true }, ...clone(state.education)];
    for (let index = 0; index < state.layout.educationBlankRows; index++) result.push(blankRow());
    result.push({ ...blankRow(), text: '職 歴', heading: true }, ...clone(state.work));
    if (result[result.length - 1]?.text.trim() !== '以上') result.push({ ...blankRow(), text: '以上', end: true });
    return result;
  }

  function table(rows, capacity, title) {
    const padded = rows.slice();
    while (padded.length < capacity) padded.push(blankRow());
    let body = '';
    for (const row of padded) {
      let rowClass = '';
      if (row.heading) rowClass = 'history-heading';
      let cellClass = '';
      if (row.end) cellClass = 'history-end';
      body += `<tr class="${rowClass}"><td class="year">${escapeHtml(row.year)}</td><td class="month">${escapeHtml(row.month)}</td><td class="${cellClass}">${escapeHtml(row.text)}</td></tr>`;
    }
    return `<table class="resume-table"><colgroup><col class="year"><col class="month"><col></colgroup><thead><tr><th>年</th><th>月</th><th>${escapeHtml(title)}</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  function photoMarkup() {
    if (state.profile.photoDataUrl) return `<img src="${escapeHtml(state.profile.photoDataUrl)}" alt="証明写真">`;
    return '<span>写真を貼る位置<br><br>縦36〜40mm<br>横24〜30mm<br><br>本人単身・胸から上</span>';
  }

  function basicMarkup() {
    let gender = '';
    if (state.profile.gender) gender = ` ${escapeHtml(state.profile.gender)}`;
    let ageLabel = '';
    if (age()) ageLabel = `(満 ${escapeHtml(age())} 歳)`;
    return `<h1 class="sheet-title">${escapeHtml(state.meta.title)}</h1>
      <p class="sheet-date">${escapeHtml(state.meta.date)} 現在</p>
      <div class="identity">
        <div class="identity-kana"><span class="label">フリガナ</span><span class="kana-value">${escapeHtml(state.profile.nameKana)}</span><span class="label">※性別${gender}</span></div>
        <div class="identity-name"><span class="label">氏 名</span><span class="name-main">${escapeHtml(state.profile.name)}</span></div>
        <div class="birth-row"><span class="label">生年月日</span><span class="label">西暦</span><span class="birth-value">${escapeHtml(formatBirth())}</span><span class="label">生 ${ageLabel}</span></div>
      </div>
      <div class="photo-box">${photoMarkup()}</div>
      <div class="contact-box"><div class="address-area">
        <div class="address-kana"><span class="label">フリガナ</span><span class="value">${escapeHtml(state.contact.addressKana)}</span></div>
        <div class="address-post"><span class="label">現住所</span><span>〒 ${escapeHtml(state.contact.postalCode)}</span></div>
        <div class="address-value">${escapeHtml(state.contact.address)}</div>
      </div><div><div class="contact-small"><span class="label">携帯電話</span><span class="contact-value">${escapeHtml(state.contact.phone)}</span></div><div class="contact-small"><span class="label">E-Mail</span><span class="contact-value">${escapeHtml(state.contact.email)}</span></div></div></div>`;
  }

  function formBox(className, title, value) {
    return `<section class="form-box ${className}"><h2>${title}</h2><div class="box-body">${escapeHtml(value)}</div></section>`;
  }

  function sheet(content) {
    return `<div class="page-frame"><section class="resume-sheet"><div class="sheet-content">${content}</div></section></div>`;
  }

  function renderPreview() {
    const history = makeHistory();
    const heading = '学歴・職歴 (各別にまとめて書く)';
    const firstRows = history.splice(0, 20);
    let markup = sheet(`${basicMarkup()}<div class="history-first">${table(firstRows, 20, heading)}</div><p class="gender-note">※「性別」欄：記載は任意です。未記載とすることも可能です。</p>`);
    while (history.length > 5) {
      const count = Math.min(28, history.length - 5);
      markup += sheet(`<div class="history-continuation">${table(history.splice(0, count), 28, heading)}</div>`);
    }
    markup += sheet(`<div class="history-continuation">${table(history, 5, heading)}</div>
      <div class="licenses-block">${table(state.licenses.slice(0, 8), 8, '免許・資格')}</div>
      ${formBox('motivation-box', '志望動機・自己PR・特技など', state.motivation)}
      ${formBox('preferences-box', '本人希望記入欄 (職種・勤務時間・勤務地など)', state.preferences)}`);
    for (let index = 8; index < state.licenses.length; index += 28) {
      markup += sheet(`<div class="history-continuation">${table(state.licenses.slice(index, index + 28), 28, '免許・資格 (続き)')}</div>`);
    }
    if (state.hobbies || state.remarks || state.otherNotes) {
      let extra = '<div class="extra-content">';
      for (const [key, title] of [['hobbies', '趣味・スポーツなど (補足)'], ['remarks', '備考'], ['otherNotes', 'その他特記事項']]) {
        if (state[key]) extra += `<h2>${title}</h2><div class="extra-box">${escapeHtml(state[key])}</div>`;
      }
      markup += sheet(`${extra}</div>`);
    }
    select('#documentStage').innerHTML = markup;
    const frames = selectAll('.page-frame');
    for (let index = 0; index < frames.length; index += 2) {
      const spread = document.createElement('div');
      spread.className = 'sheet-spread';
      frames[index].before(spread);
      spread.append(frames[index]);
      if (frames[index + 1]) spread.append(frames[index + 1]);
    }
    document.documentElement.classList.toggle('paper-a3', state.layout.paper === 'a3');
    select('#paperSelect').value = state.layout.paper;
    let pageRule = '@page { size: A4 portrait; margin: 0; }';
    let pageLabel = `A4縦・${frames.length}ページ`;
    if (state.layout.paper === 'a3') {
      pageRule = '@page { size: A3 landscape; margin: 0; }';
      pageLabel = `A3横・${Math.ceil(frames.length / 2)}ページ`;
    }
    select('#printPageStyle').textContent = pageRule;
    select('#agePreview').value = age();
    select('#pageCount').textContent = pageLabel;
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => { updateScale(); checkOverflow(); });
  }

  function updateScale() {
    const pane = select('.preview-pane');
    const choice = select('#zoomSelect').value;
    const width = Math.max(180, pane.clientWidth - 56);
    let paperWidth = 210;
    if (state.layout.paper === 'a3') paperWidth = 420;
    let scale = Math.min(1, width / (paperWidth / 25.4 * 96));
    if (choice !== 'fit') scale = Number(choice);
    document.documentElement.style.setProperty('--preview-scale', String(scale));
    for (const frame of selectAll('.page-frame')) {
      frame.style.width = `${210 / 25.4 * 96 * scale}px`;
      frame.style.height = `${297 / 25.4 * 96 * scale}px`;
    }
  }

  function checkOverflow() {
    let overflow = false;
    const unit = 96 / 25.4;
    for (const tableElement of selectAll('.resume-table')) {
      const expected = (5.29 + tableElement.tBodies[0].rows.length * 7.9375) * unit;
      if (tableElement.offsetHeight > expected + 4) overflow = true;
    }
    for (const box of selectAll('.form-box, .contact-box, .identity, .photo-box')) {
      if (box.scrollHeight > box.clientHeight + 3 || box.scrollWidth > box.clientWidth + 3) overflow = true;
    }
    for (const content of selectAll('.extra-content')) {
      if (content.offsetHeight > 250 * unit) overflow = true;
    }
    const warning = select('#layoutWarning');
    warning.hidden = !overflow;
    warning.textContent = '入力内容が枠を超えています。長い住所・本文・一覧の行を短くするか、一覧を複数行に分けてください。枠内に収まるまでPDF出力を停止します。';
    return overflow;
  }

  function replaceState(candidate, message) {
    if (!confirm(message)) return;
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(state));
    } catch {
      alert('変更前のバックアップを保存できません。先にJSONを書き出してください。');
      return;
    }
    state = candidate;
    commit(true);
  }

  function parseJson(raw) {
    if (new Blob([raw]).size > MAX_JSON_BYTES) throw new Error('JSONは5MB以内にしてください。');
    try { return normalize(JSON.parse(raw)); }
    catch (error) {
      if (error instanceof SyntaxError) throw new Error('JSONの形式が正しくありません。');
      throw error;
    }
  }

  function exportJson() {
    const payload = { ...state, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `rirekisho-data_${new Date().toISOString().slice(0, 10)}.private.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function importFile(file) {
    if (!file) return;
    if (file.size > MAX_JSON_BYTES) { alert('JSONは5MB以内にしてください。'); return; }
    try { replaceState(parseJson(await file.text()), '現在の内容をJSONの内容に置き換えますか？'); }
    catch (error) { alert(error.message); }
  }

  function importCareer() {
    try {
      const raw = localStorage.getItem(CAREER_STORAGE_KEY);
      if (!raw) { alert('保存済みの職務経歴書がありません。'); return; }
      const career = JSON.parse(raw);
      if (!Array.isArray(career.companies)) throw new Error();
      const candidate = clone(state);
      const imported = [];
      for (const company of career.companies.slice().reverse()) {
        const parts = text(company.period).split(/[〜~～]/);
        const start = parts[0].match(/(\d{4})年\s*(\d{1,2})月/);
        const end = text(parts[1]).match(/(\d{4})年\s*(\d{1,2})月/);
        imported.push({ year: start?.[1] || '', month: start?.[2] || '', text: `${text(company.name)} 入社` });
        if (end) imported.push({ year: end[1], month: end[2], text: `${text(company.name)} 退職` });
        else imported.push({ year: '', month: '', text: '現在に至る' });
      }
      if (!imported.length) { alert('取り込める職歴がありません。'); return; }
      candidate.work = imported;
      if (!candidate.profile.name) candidate.profile.name = text(career.meta?.name);
      replaceState(normalize(candidate), '保存済み職務経歴書から氏名・職歴を取り込みますか？');
    } catch { alert('職務経歴書データを読み込めませんでした。'); }
  }

  function resizePhoto(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_JSON_BYTES) {
      alert('写真は5MB以内のJPEG・PNG・WebPを選んでください。'); return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 354; canvas.height = 472;
      const context = canvas.getContext('2d');
      const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      state.profile.photoDataUrl = canvas.toDataURL('image/jpeg', 0.86);
      URL.revokeObjectURL(url);
      commit(true);
    };
    image.onerror = () => { URL.revokeObjectURL(url); alert('写真を読み込めませんでした。'); };
    image.src = url;
  }

  for (const element of selectAll('[data-path]')) {
    element.id = element.dataset.path.replaceAll('.', '-');
    element.autocomplete = 'off';
    const label = element.closest('.field')?.querySelector('label');
    if (label) label.htmlFor = element.id;
    element.addEventListener('input', () => setField(element));
  }
  for (const [id, key] of [['addEducationBtn', 'education'], ['addWorkBtn', 'work'], ['addLicenseBtn', 'licenses']]) {
    select(`#${id}`).addEventListener('click', () => { state[key].push(blankRow()); commit(true); });
  }
  select('#importCareerBtn').addEventListener('click', importCareer);
  select('#exportJsonBtn').addEventListener('click', exportJson);
  select('#importJsonBtn').addEventListener('click', () => select('#importFile').click());
  select('#importFile').addEventListener('change', event => { importFile(event.target.files[0]); event.target.value = ''; });
  select('#applyJsonBtn').addEventListener('click', () => {
    try { replaceState(parseJson(select('#rawJson').value), '直接編集したJSONを反映しますか？'); }
    catch (error) { alert(error.message); }
  });
  for (const id of ['newBtn', 'resetBtn']) select(`#${id}`).addEventListener('click', () => replaceState(clone(EMPTY), '入力内容を空にしますか？'));
  select('#photoInput').addEventListener('change', event => {
    if (event.target.files[0]) resizePhoto(event.target.files[0]);
    event.target.value = '';
  });
  select('#removePhotoBtn').addEventListener('click', () => {
    if (!confirm('写真を削除しますか？')) return;
    state.profile.photoDataUrl = ''; commit(true);
  });
  select('#zoomSelect').addEventListener('change', updateScale);
  select('#paperSelect').addEventListener('change', event => {
    state.layout.paper = event.target.value;
    commit();
  });
  select('#printBtn').addEventListener('click', () => {
    if (checkOverflow()) { alert('枠を超えている内容を調整してから印刷してください。'); return; }
    if (!saveNow()) { alert('保存に失敗しました。JSONをバックアップしてください。'); return; }
    document.title = `履歴書_${new Date().toISOString().slice(0, 10)}`;
    window.print();
  });
  window.addEventListener('resize', updateScale);
  window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });
  renderEditors();
  renderPreview();
  syncJson();
  select('#saveStatus').textContent = startupMessage;
})();
