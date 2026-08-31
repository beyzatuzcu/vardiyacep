"use strict";

const APP_VERSION = "1.5.0";
const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "vardiyacep.dataset.v5";
const PERSON_KEY = "vardiyacep.person.v1";
const MAPPING_KEY = "vardiyacep.mapping.v1";
const REMINDER_KEY = "vardiyacep.reminder.v1";

const CATEGORY_INFO = {
  morning: { label: "Sabah vardiyası", short: "Sabah", start: "06:00", className: "morning" },
  evening: { label: "Akşam vardiyası", short: "Akşam", start: "14:00", className: "evening" },
  night: { label: "Gece vardiyası", short: "Gece", start: "22:00", className: "night" },
  off: { label: "İzinli / Dinlenme", short: "İzinli", start: "", className: "off" },
  annual: { label: "Yıllık izin", short: "Yıllık izin", start: "", className: "annual" },
  other: { label: "Diğer görev", short: "Diğer", start: "09:00", className: "other" }
};

const state = {
  dataset: null,
  selectedId: null,
  mappings: loadJson(MAPPING_KEY, {}),
  calendarCursor: null,
  deferredInstall: null,
  notificationTimer: null
};

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (error) { console.warn("Yerel kayıt yapılamadı", error); }
}
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}
function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[ch]);
}
function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i").replaceAll("ğ", "g").replaceAll("ü", "u")
    .replaceAll("ş", "s").replaceAll("ö", "o").replaceAll("ç", "c")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}
function localDate(iso) {
  if (!iso) return null;
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isoLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function addDays(date, count) {
  const out = new Date(date);
  out.setDate(out.getDate() + count);
  return out;
}
function dateLabel(date, opts={weekday:"long",day:"numeric",month:"long"}) {
  return new Intl.DateTimeFormat("tr-TR", opts).format(date);
}
function initials(name) {
  return String(name || "—").split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join("").toLocaleUpperCase("tr-TR");
}
function slugify(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g,"-") || "vardiya";
}
function personBaseKey(person) {
  return [person.id, person.role, person.team, person.unit].map(normalizeText).join("::");
}
function ensurePersonKeys(dataset) {
  const used = new Set();
  dataset.people.forEach((person, index) => {
    let key = String(person.key || personBaseKey(person) || `${person.id || "personel"}::${index + 1}`);
    const base = key;
    let suffix = 2;
    while (used.has(key)) key = `${base}::${suffix++}`;
    person.key = key;
    used.add(key);
  });
}

function inferMapping(code) {
  const raw = String(code ?? "").trim();
  const key = raw.toLocaleUpperCase("tr-TR").replaceAll("İ","I").replaceAll("Ü","U");
  let category = "other";
  if (/^(Y|YI|YILLIK)/.test(key)) category = "annual";
  else if (/^(I|IZIN|OFF|R)$/.test(key) || raw === "ı") category = "off";
  else if (key.startsWith("S")) category = "morning";
  else if (key.startsWith("A")) category = "evening";
  else if (key.startsWith("G")) category = "night";
  else if (key === "U") category = "off";
  const base = CATEGORY_INFO[category];
  return { code: raw, category, label: key === "U" ? "Ücretsiz izin" : base.label, start: base.start };
}
function getMapping(code) {
  const key = String(code ?? "").trim();
  return state.mappings[key] || inferMapping(key);
}
function ensureMappings(dataset) {
  const unique = new Set();
  dataset.people.forEach(p => Object.values(p.shifts || {}).forEach(code => code && unique.add(String(code).trim())));
  let changed = false;
  unique.forEach(code => {
    if (!state.mappings[code]) { state.mappings[code] = inferMapping(code); changed = true; }
  });
  if (changed) saveJson(MAPPING_KEY, state.mappings);
}

async function unzipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Geçerli bir .xlsx ZIP yapısı bulunamadı.");
  const entriesCount = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entries = new Map();
  let offset = centralOffset;
  for (let i=0; i<entriesCount; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Excel arşivi okunamadı.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    entries.set(name, async () => {
      if (method === 0) return compressed;
      if (method !== 8) throw new Error(`Desteklenmeyen sıkıştırma yöntemi: ${method}`);
      if (!("DecompressionStream" in window)) throw new Error("Bu tarayıcı Excel açmayı desteklemiyor. Chrome veya Edge kullanın.");
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
async function entryText(entries, name) {
  const loader = entries.get(name);
  if (!loader) return null;
  return new TextDecoder("utf-8").decode(await loader());
}
function xml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Excel XML verisi çözümlenemedi.");
  return doc;
}
function elements(doc, localName) {
  return Array.from(doc.getElementsByTagNameNS("*", localName));
}
function columnIndex(ref) {
  const letters = String(ref).match(/[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  let n=0;
  for (const ch of letters) n = n*26 + ch.charCodeAt(0)-64;
  return n-1;
}
function resolveTarget(target) {
  const parts = ("xl/" + target.replace(/^\//,"" )).split("/");
  const out=[];
  for (const part of parts) {
    if (part === "." || !part) continue;
    if (part === "..") out.pop(); else out.push(part);
  }
  return out.join("/");
}
async function readWorksheet(entries, path, sharedStrings) {
  const text = await entryText(entries, path);
  if (!text) return [];
  const doc = xml(text);
  const rows = [];
  for (const rowEl of elements(doc, "row")) {
    const r = Number(rowEl.getAttribute("r") || rows.length + 1) - 1;
    if (!rows[r]) rows[r] = [];
    for (const cell of Array.from(rowEl.childNodes).filter(n => n.nodeType === 1 && n.localName === "c")) {
      const c = columnIndex(cell.getAttribute("r"));
      const type = cell.getAttribute("t");
      const vNode = Array.from(cell.childNodes).find(n => n.nodeType === 1 && n.localName === "v");
      let value = "";
      if (type === "inlineStr") value = elements(cell, "t").map(n => n.textContent || "").join("");
      else if (type === "s") value = sharedStrings[Number(vNode?.textContent || 0)] ?? "";
      else if (type === "b") value = (vNode?.textContent === "1");
      else if (type === "str") value = vNode?.textContent || "";
      else if (vNode) {
        const n = Number(vNode.textContent);
        value = Number.isFinite(n) ? n : vNode.textContent;
      }
      rows[r][c] = value;
    }
  }
  return rows;
}
async function parseXlsx(file) {
  const entries = await unzipEntries(await file.arrayBuffer());
  const wbText = await entryText(entries, "xl/workbook.xml");
  const relText = await entryText(entries, "xl/_rels/workbook.xml.rels");
  if (!wbText || !relText) throw new Error("Çalışma kitabı bilgisi bulunamadı.");
  const wbDoc = xml(wbText);
  const relDoc = xml(relText);
  const rels = new Map(elements(relDoc, "Relationship").map(r => [r.getAttribute("Id"), resolveTarget(r.getAttribute("Target") || "")]));
  let sharedStrings = [];
  const sharedText = await entryText(entries, "xl/sharedStrings.xml");
  if (sharedText) sharedStrings = elements(xml(sharedText), "si").map(si => elements(si,"t").map(t=>t.textContent || "").join(""));
  const sheets = [];
  for (const sh of elements(wbDoc, "sheet")) {
    const relId = sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || sh.getAttribute("r:id");
    const path = rels.get(relId);
    if (!path) continue;
    sheets.push({name: sh.getAttribute("name") || "Sayfa", rows: await readWorksheet(entries, path, sharedStrings)});
  }
  return workbookToDataset(sheets, file.name);
}
function excelSerialToIso(serial) {
  const ms = Math.round((Number(serial) - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}
function parseDateValue(value) {
  if (typeof value === "number" && value > 30000 && value < 80000) return excelSerialToIso(value);
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return isoLocal(value);
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if (match) {
    let [,d,m,y] = match; if (y.length === 2) y = "20" + y;
    return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  return null;
}
function detectHeader(rows, requiredSets) {
  let best = null;
  rows.slice(0,40).forEach((row, index) => {
    const normalized = (row || []).map(normalizeText);
    let score = 0;
    requiredSets.forEach(set => { if (normalized.some(v => set.some(k => v.includes(k)))) score++; });
    if (!best || score > best.score) best = {index, row: row || [], normalized, score};
  });
  return best;
}
function findColumn(normalized, keys) {
  return normalized.findIndex(v => keys.some(k => v.includes(k)));
}

const MONTH_HINTS = {
  ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6,
  temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12
};
const WEEKDAY_HINTS = {
  pazar: 0, pazartesi: 1, sali: 2, carsamba: 3, persembe: 4, cuma: 5, cumartesi: 6
};
function detectMonthHint(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    for (const [name, month] of Object.entries(MONTH_HINTS)) {
      if (normalized.includes(name)) return {month, source: String(value || "")};
    }
  }
  return null;
}
function detectYearHint(...values) {
  for (const value of values) {
    const match = String(value || "").match(/(?:^|\D)(20\d{2})(?:\D|$)/);
    if (match) return Number(match[1]);
  }
  return null;
}
function weekdayHint(value) {
  const normalized = normalizeText(value);
  for (const [name, day] of Object.entries(WEEKDAY_HINTS)) {
    if (normalized === name || normalized.includes(name)) return day;
  }
  return null;
}
function makeIsoDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
function weekdayScore(dateCols, weekdayRow) {
  let compared = 0, matched = 0;
  for (const {index, date} of dateCols) {
    const expected = weekdayHint(weekdayRow?.[index]);
    if (expected === null) continue;
    compared++;
    if (localDate(date)?.getDay() === expected) matched++;
  }
  return {compared, matched};
}
function alignedDateColumns(dateCols, row) {
  if (!row || !dateCols.length) return null;
  const mapped = dateCols.map(({index}) => {
    const date = parseDateValue(row[index]);
    return date ? {index, date} : null;
  }).filter(Boolean);
  if (mapped.length < 28) return null;
  const parsed = mapped.map(x => localDate(x.date)).filter(Boolean);
  if (parsed.length !== mapped.length) return null;
  const monthKeys = new Set(parsed.map(d => `${d.getFullYear()}-${d.getMonth()+1}`));
  const days = parsed.map(d => d.getDate());
  const sequential = days[0] === 1 && days.every((day, i) => day === i + 1);
  if (monthKeys.size !== 1 || !sequential) return null;
  return mapped;
}

function correctDateColumns(dateCols, sheet, header, sourceFile) {
  // Ay bilgisini önce dosya adından, sonra sayfa adından ve üst başlık hücrelerinden bul.
  // Kurumun şablonunda alt başlık satırı bir önceki ayın tarihlerini taşıyabiliyor.
  const topText = (sheet.rows || []).slice(0, 8).flat().filter(v => v !== undefined && v !== null).join(" ");
  const fileHint = detectMonthHint(sourceFile);
  const sheetHint = detectMonthHint(sheet.name);
  const cellHint = detectMonthHint(topText);
  const hint = fileHint || sheetHint || cellHint;
  if (!hint || !dateCols.length) return {dateCols, correction: null};

  const explicitYear = detectYearHint(sourceFile, sheet.name, topText);

  // Önce başlığın hemen üstündeki satırlarda aynı sütunlara denk gelen gerçek tarihleri kontrol et.
  // Eylül şablonunda örn. alt satır Ağustos 1-31 iken üst satır Eylül 1-30 tarihlerini içeriyor.
  for (let r = header.index - 1; r >= Math.max(0, header.index - 3); r--) {
    const aligned = alignedDateColumns(dateCols, sheet.rows[r] || []);
    if (!aligned) continue;
    const first = localDate(aligned[0].date);
    const last = localDate(aligned.at(-1).date);
    if (!first || !last) continue;
    const matchesMonth = first.getMonth() + 1 === hint.month && last.getMonth() + 1 === hint.month;
    const matchesYear = !explicitYear || (first.getFullYear() === explicitYear && last.getFullYear() === explicitYear);
    if (matchesMonth && matchesYear) {
      return {
        dateCols: aligned,
        correction: {
          from: dateCols[0].date.slice(0,7),
          to: aligned[0].date.slice(0,7),
          reason: "Excel üst satırındaki gerçek tarih başlığı"
        }
      };
    }
  }

  const rawDates = dateCols.map(x => localDate(x.date)).filter(Boolean);
  if (!rawDates.length) return {dateCols, correction: null};

  const rawYearCounts = new Map();
  rawDates.forEach(d => rawYearCounts.set(d.getFullYear(), (rawYearCounts.get(d.getFullYear()) || 0) + 1));
  const rawYear = [...rawYearCounts.entries()].sort((a,b) => b[1] - a[1])[0][0];
  const years = [...new Set([explicitYear, rawYear, rawYear - 1, rawYear + 1, new Date().getFullYear()].filter(Boolean))];
  const weekdayRow = header.index > 0 ? sheet.rows[header.index - 1] || [] : [];
  const originalScore = weekdayScore(dateCols, weekdayRow);
  let best = null;

  for (const year of years) {
    const mapped = [];
    for (const item of dateCols) {
      const day = localDate(item.date)?.getDate();
      const date = makeIsoDate(year, hint.month, day);
      // Hedef ay 30/29/28 günse eski şablondaki 31. gün sütununu atla.
      if (!date) continue;
      mapped.push({...item, date});
    }
    if (mapped.length < 28) continue;
    const score = weekdayScore(mapped, weekdayRow);
    if (!best || score.matched > best.score.matched || (score.matched === best.score.matched && score.compared > best.score.compared)) {
      best = {mapped, year, score};
    }
  }

  if (!best) return {dateCols, correction: null};
  const originalMonths = new Set(rawDates.map(d => d.getMonth() + 1));
  const days = rawDates.map(d => d.getDate());
  const startsAtOne = days[0] === 1;
  const sequentialDays = startsAtOne && days.every((day, i) => day === i + 1);
  const nonDecreasingDays = days.every((day, i) => i === 0 || day >= days[i-1]);
  const monthMismatch = originalMonths.size === 1 && !originalMonths.has(hint.month);
  const strongWeekdayEvidence = best.score.compared >= 5 && best.score.matched / best.score.compared >= 0.8 && best.score.matched > originalScore.matched;
  const strongFileNameEvidence = Boolean(fileHint) && monthMismatch && sequentialDays;
  const supportingHintEvidence = Boolean(sheetHint || cellHint) && monthMismatch && nonDecreasingDays && best.score.matched >= originalScore.matched;
  if (!strongWeekdayEvidence && !strongFileNameEvidence && !supportingHintEvidence) return {dateCols, correction: null};

  return {
    dateCols: best.mapped,
    correction: {
      from: dateCols[0].date.slice(0,7),
      to: `${best.year}-${String(hint.month).padStart(2,"0")}`,
      reason: fileHint ? "dosya adındaki ay" : sheetHint ? "sayfa adındaki ay" : "Excel başlığındaki ay"
    }
  };
}
function workbookToDataset(sheets, sourceFile) {
  const scheduleCandidates = sheets.map(sheet => {
    const header = detectHeader(sheet.rows, [["sicil","personelno"],["adisoyadi","calisaninadi","personeladi"]]);
    return {sheet, header};
  }).filter(x => x.header && x.header.score >= 2).sort((a,b) => b.header.score-a.header.score);
  if (!scheduleCandidates.length) throw new Error("Sicil ve Adı Soyadı başlıklarını içeren vardiya sayfası bulunamadı.");
  const {sheet, header} = scheduleCandidates[0];
  const n = header.normalized;
  const idCol = findColumn(n,["sicil","personelno"]);
  const nameCol = findColumn(n,["adisoyadi","calisaninadi","personeladi"]);
  const roleCol = findColumn(n,["fiiligorevi","pozisyon","gorev"]);
  const teamCol = findColumn(n,["ekip","takim"]);
  const titleCol = findColumn(n,["gercekunvani","unvan"]);
  const unitCol = findColumn(n,["birim"]);
  let dateCols=[];
  header.row.forEach((value,index) => {
    const date = parseDateValue(value);
    if (date) dateCols.push({index,date});
  });
  if (!dateCols.length) throw new Error("Tarih sütunları bulunamadı. Tarihlerin Excel tarihi olarak girildiğini kontrol edin.");
  // 1,2,3... şeklinde tam ve ardışık aylık tarih başlığı varsa tüm günleri koru.
  // Bazı satırlarda son gün boş bırakılıp aynı hücreye toplam saat (48, 64 vb.) yazılabiliyor;
  // bu nedenle yalnızca sütun genelindeki sayısal orana bakıp 31. günü silmemeliyiz.
  const rawHeaderDays = dateCols.map(item => localDate(item.date)?.getDate());
  const isSequentialMonthlyHeader = rawHeaderDays.length >= 28 && rawHeaderDays[0] === 1 && rawHeaderDays.every((day, i) => day === i + 1);
  if (!isSequentialMonthlyHeader) {
    // Ardışık bir aylık başlık değilse, yanlışlıkla tarih başlığı kalmış toplam sütunlarını ele.
    dateCols = dateCols.filter(({index}) => {
      const samples=[];
      for (let r=header.index+1; r<sheet.rows.length && samples.length<250; r++) {
        const row=sheet.rows[r] || [];
        const name=String(row[nameCol] ?? "").trim();
        const rawId=row[idCol];
        const id=typeof rawId === "number" ? String(Math.trunc(rawId)) : String(rawId ?? "").trim();
        const value=row[index];
        if (name && /^\d+$/.test(id) && value !== undefined && value !== null && String(value).trim() !== "") samples.push(value);
      }
      if (samples.length < 10) return true;
      const numericRatio=samples.filter(v => typeof v === "number" && Number.isFinite(v)).length / samples.length;
      return numericRatio < 0.65;
    });
  }
  if (!dateCols.length) throw new Error("Vardiya günü olarak kullanılabilecek tarih sütunu bulunamadı.");
  const correctedDates = correctDateColumns(dateCols, sheet, header, sourceFile);
  dateCols = correctedDates.dateCols;
  const dateCorrection = correctedDates.correction;
  const byKey = new Map();
  for (let r=header.index+1; r<sheet.rows.length; r++) {
    const row = sheet.rows[r] || [];
    const name = String(row[nameCol] ?? "").trim();
    const idRaw = row[idCol];
    const id = typeof idRaw === "number" ? String(Math.trunc(idRaw)) : String(idRaw ?? "").trim();
    if (!name || !/^\d+$/.test(id)) continue;
    const shifts={}; let filled=0;
    dateCols.forEach(({index,date}) => {
      const raw = row[index];
      const code = String(raw ?? "").trim();
      // Tarih hücresine kayan toplam saat (48, 64 vb.) değerlerini vardiya kodu sayma.
      if (raw !== undefined && raw !== null && typeof raw !== "number" && code !== "") {
        shifts[date] = code; filled++;
      }
    });
    if (filled < Math.min(3, dateCols.length)) continue;
    const person = {
      id, name,
      role: roleCol >= 0 ? String(row[roleCol] ?? "").trim() : "",
      team: teamCol >= 0 ? String(row[teamCol] ?? "").trim() : "",
      title: titleCol >= 0 ? String(row[titleCol] ?? "").trim() : "",
      unit: unitCol >= 0 ? String(row[unitCol] ?? "").trim() : "",
      shifts
    };
    person.key = personBaseKey(person);
    const old = byKey.get(person.key);
    if (!old || Object.keys(person.shifts).length >= Object.keys(old.shifts).length) byKey.set(person.key, person);
  }
  if (!byKey.size) throw new Error("Personel vardiya satırları bulunamadı.");

  for (const extra of sheets) {
    const leaveHeader = detectHeader(extra.rows, [["personelno","sicil"],["calisaninadi","adisoyadi"],["kalanizin"]]);
    if (!leaveHeader || leaveHeader.score < 3) continue;
    const ln=leaveHeader.normalized;
    const lid=findColumn(ln,["personelno","sicil"]);
    const remaining=findColumn(ln,["kalanizin"]);
    const used=findColumn(ln,["kullanim","kullanilan"]);
    for (let r=leaveHeader.index+1; r<extra.rows.length; r++) {
      const row=extra.rows[r] || [];
      const raw=row[lid]; const id=typeof raw === "number" ? String(Math.trunc(raw)) : String(raw ?? "").trim();
      const matches = Array.from(byKey.values()).filter(person => person.id === id);
      if (!matches.length) continue;
      matches.forEach(person => { person.leave={remaining: row[remaining] ?? null, used: used >= 0 ? row[used] ?? null : null}; });
    }
  }

  return {
    sourceFile,
    sheet: sheet.name,
    dates: dateCols.map(x=>x.date).sort(),
    people: Array.from(byKey.values()).sort((a,b)=>a.name.localeCompare(b.name,"tr") || a.team.localeCompare(b.team,"tr") || a.role.localeCompare(b.role,"tr")),
    importedAt: new Date().toISOString(),
    dateCorrection,
    appVersion: APP_VERSION
  };
}

async function importFile(file) {
  if (!file || !file.name.toLowerCase().endsWith(".xlsx")) { toast("Lütfen .xlsx uzantılı Excel dosyası seçin."); return; }
  setParseStatus("Excel okunuyor ve personel programları hazırlanıyor…", true);
  try {
    const dataset = await parseXlsx(file);
    loadDataset(dataset, true);
    const correctionText = dataset.dateCorrection ? ` Tarihler ${dataset.dateCorrection.to.slice(5,7)}.${dataset.dateCorrection.to.slice(0,4)} ayına otomatik düzeltildi.` : "";
    setParseStatus(`${dataset.people.length} personel ve ${dataset.dates.length} gün başarıyla okundu.${correctionText}`, false);
    toast(dataset.dateCorrection ? "Excel okundu; ay bilgisi otomatik düzeltildi." : "Excel başarıyla içe aktarıldı.");
  } catch (error) {
    console.error(error);
    setParseStatus(error.message || "Excel okunamadı.", false, true);
  }
}
function setParseStatus(message, busy=false, error=false) {
  const el=$("parseStatus"); el.classList.remove("hidden"); el.textContent=message;
  el.style.background = error ? "#fff1f0" : busy ? "#fef3c7" : "#edf5f3";
  el.style.color = error ? "#b42318" : "#0b5d57";
}
function loadDataset(dataset, persist=false) {
  if (!dataset?.people?.length || !dataset?.dates?.length) throw new Error("Veri kümesi eksik.");
  state.dataset=dataset;
  ensurePersonKeys(dataset);
  ensureMappings(dataset);
  if (persist) saveJson(STORAGE_KEY,dataset);
  const savedKey=localStorage.getItem(PERSON_KEY);
  const savedPerson=dataset.people.find(p=>p.key===savedKey) || dataset.people.find(p=>p.id===savedKey);
  state.selectedId=savedPerson?.key || dataset.people[0].key;
  state.calendarCursor=localDate(dataset.dates[0]);
  $("importPanel").classList.add("hidden");
  $("appPanel").classList.remove("hidden");
  renderAll();
  scheduleReminderCheck();
  syncServiceWorker();
}
function clearDataset() {
  localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(PERSON_KEY);
  state.dataset=null; state.selectedId=null;
  $("appPanel").classList.add("hidden"); $("importPanel").classList.remove("hidden");
  $("fileInput").value=""; $("parseStatus").classList.add("hidden");
  toast("Kayıtlı vardiya verileri silindi.");
}
function selectedPerson() { return state.dataset?.people.find(p=>p.key===state.selectedId) || null; }
function setSelectedPerson(key) {
  if (!state.dataset?.people.some(p=>p.key===key)) return;
  state.selectedId=key; localStorage.setItem(PERSON_KEY,key);
  $("personResults").classList.add("hidden"); $("personSearch").value="";
  renderAll(); scheduleReminderCheck(); syncServiceWorker();
}
function renderAll() {
  renderSelectedPerson(); renderHome(); renderCalendar(); renderMappings(); renderDatasetSummary(); renderNotificationState();
}
function renderSelectedPerson() {
  const p=selectedPerson(); if(!p)return;
  $("selectedInitials").textContent=initials(p.name);
  $("selectedName").textContent=p.name;
  $("selectedMeta").textContent=[`Sicil ${p.id}`,p.team,p.role].filter(Boolean).join(" • ");
}
function renderPersonSearch(query="") {
  if (!state.dataset) return;
  const q=normalizeText(query);
  const list=state.dataset.people.filter(p => !q || normalizeText(`${p.name} ${p.id} ${p.team} ${p.role} ${p.unit}`).includes(q)).slice(0,40);
  $("personResults").innerHTML=list.map(p=>`<button class="search-item" type="button" data-person="${esc(p.key)}"><span><strong>${esc(p.name)}</strong><small>${[`Sicil ${p.id}`,p.role,p.unit].filter(Boolean).map(esc).join(" • ")}</small></span>${p.team?`<span class="team-pill">${esc(p.team)}</span>`:""}</button>`).join("") || `<div class="empty-state">Eşleşen personel bulunamadı.</div>`;
  $("personResults").classList.remove("hidden");
  $("personResults").querySelectorAll("[data-person]").forEach(btn=>btn.addEventListener("click",()=>setSelectedPerson(btn.dataset.person)));
}
function shiftInfo(person, iso) {
  const code=person?.shifts?.[iso];
  if (!code) return {code:"—", category:"none", label:"Program yok", short:"Yok", start:"", className:"neutral"};
  const map=getMapping(code); const base=CATEGORY_INFO[map.category] || CATEGORY_INFO.other;
  return {code, category:map.category, label:map.label || base.label, short:base.short, start:map.start || "", className:base.className};
}
function statsFor(person) {
  const result={work:0,off:0,annual:0,night:0};
  state.dataset.dates.forEach(d=>{
    const info=shiftInfo(person,d);
    if (["morning","evening","night","other"].includes(info.category)) result.work++;
    if (info.category==="off") result.off++;
    if (info.category==="annual") result.annual++;
    if (info.category==="night") result.night++;
  });
  return result;
}
function renderShiftCard(prefix,date,person) {
  const iso=isoLocal(date); const info=shiftInfo(person,iso);
  $(`${prefix}Date`).textContent=dateLabel(date);
  const badge=$(`${prefix}Badge`); badge.textContent=info.code; badge.className=`shift-badge ${info.className}`;
  $(`${prefix}Title`).textContent=info.category==="none" ? "Bu tarihte program yok" : info.label;
  const detail=info.start ? `${info.start} başlangıç • Kod: ${info.code}` : info.category==="none" ? "Dosyanın tarih aralığı dışında olabilir." : `Kod: ${info.code}`;
  $(`${prefix}Detail`).textContent=detail;
}
function renderHome() {
  const p=selectedPerson(); if(!p)return;
  const today=new Date(); today.setHours(0,0,0,0);
  renderShiftCard("today",today,p); renderShiftCard("tomorrow",addDays(today,1),p);
  const stats=statsFor(p);
  const leave=p.leave?.remaining;
  const statItems=[
    ["Çalışma günü",stats.work], ["İzin / dinlenme",stats.off], ["Yıllık izin günü",stats.annual], ["Kalan yıllık izin",leave ?? "—"]
  ];
  $("statsGrid").innerHTML=statItems.map(([label,value])=>`<article class="stat card"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join("");
  const start=state.dataset.dates.includes(isoLocal(today)) ? today : localDate(state.dataset.dates[0]);
  const upcoming=[];
  for(let i=0;i<7;i++) { const d=addDays(start,i); const iso=isoLocal(d); if(state.dataset.dates.includes(iso)) upcoming.push({d,info:shiftInfo(p,iso)}); }
  $("upcomingList").className=upcoming.length?"schedule-list":"schedule-list empty-state";
  $("upcomingList").innerHTML=upcoming.length?upcoming.map(({d,info})=>`<div class="schedule-row"><div class="date-box"><strong>${d.getDate()}</strong><small>${dateLabel(d,{weekday:"short"})}</small></div><div class="schedule-copy"><strong>${esc(info.label)}</strong><small>${info.start?`${esc(info.start)} başlangıç • `:""}${dateLabel(d,{day:"numeric",month:"long"})}</small></div><span class="code-pill ${esc(info.className)}">${esc(info.code)}</span></div>`).join(""):"Bu dosyada gösterilecek gün bulunamadı.";
}
function renderCalendar() {
  const p=selectedPerson(); if(!p || !state.calendarCursor)return;
  const year=state.calendarCursor.getFullYear(), month=state.calendarCursor.getMonth();
  $("calendarMonth").textContent=dateLabel(new Date(year,month,1),{month:"long",year:"numeric"});
  const first=new Date(year,month,1); const startOffset=(first.getDay()+6)%7;
  const gridStart=addDays(first,-startOffset); const todayIso=isoLocal(new Date());
  let html="";
  for(let i=0;i<42;i++) {
    const d=addDays(gridStart,i); const iso=isoLocal(d); const info=shiftInfo(p,iso); const outside=d.getMonth()!==month;
    html+=`<div class="calendar-day${outside?" outside":""}${iso===todayIso?" today":""}" title="${esc(info.label)}"><span class="day-number">${d.getDate()}</span>${info.category!=="none"?`<div class="day-code ${esc(info.className)}">${esc(info.code)}</div><span class="day-label">${esc(info.short)}</span>`:""}</div>`;
  }
  $("calendarGrid").innerHTML=html;
  const categories=["morning","evening","night","off","annual","other"];
  $("legend").innerHTML=categories.map(c=>`<span class="legend-item"><i class="legend-dot day-code ${c}"></i>${esc(CATEGORY_INFO[c].short)}</span>`).join("");
}
function renderMappings() {
  const p=selectedPerson(); if(!p)return;
  const codes=Array.from(new Set(Object.values(p.shifts||{}).map(String))).sort((a,b)=>a.localeCompare(b,"tr",{numeric:true}));
  $("mappingTable").innerHTML=codes.map(code=>{
    const map=getMapping(code);
    return `<div class="mapping-row" data-code="${esc(code)}"><span class="mapping-code">${esc(code)}</span><select class="mapping-category"><option value="morning" ${map.category==="morning"?"selected":""}>Sabah vardiyası</option><option value="evening" ${map.category==="evening"?"selected":""}>Akşam vardiyası</option><option value="night" ${map.category==="night"?"selected":""}>Gece vardiyası</option><option value="off" ${map.category==="off"?"selected":""}>İzin / dinlenme</option><option value="annual" ${map.category==="annual"?"selected":""}>Yıllık izin</option><option value="other" ${map.category==="other"?"selected":""}>Diğer görev</option></select><input class="mapping-time" type="time" value="${esc(map.start||"")}" aria-label="${esc(code)} başlangıç saati"></div>`;
  }).join("") || `<div class="empty-state">Bu personel için kod bulunamadı.</div>`;
  $("mappingTable").querySelectorAll(".mapping-row").forEach(row=>{
    const code=row.dataset.code, select=row.querySelector(".mapping-category"), time=row.querySelector(".mapping-time");
    const save=()=>{
      const category=select.value, base=CATEGORY_INFO[category];
      state.mappings[code]={code,category,label:base.label,start:time.value || base.start};
      saveJson(MAPPING_KEY,state.mappings); renderHome(); renderCalendar(); scheduleReminderCheck(); syncServiceWorker();
    };
    select.addEventListener("change",()=>{ if(!time.value) time.value=CATEGORY_INFO[select.value].start; save(); });
    time.addEventListener("change",save);
  });
}
function renderDatasetSummary() {
  if(!state.dataset)return;
  const start=localDate(state.dataset.dates[0]), end=localDate(state.dataset.dates.at(-1));
  $("datasetSummary").textContent=`${state.dataset.sourceFile || "Excel"} • ${state.dataset.people.length} personel • ${dateLabel(start,{day:"numeric",month:"long",year:"numeric"})} – ${dateLabel(end,{day:"numeric",month:"long",year:"numeric"})}`;
}
function switchTab(name) {
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.tab===name));
  document.querySelectorAll(".tab-page").forEach(x=>x.classList.toggle("active",x.id===`tab-${name}`));
}

function reminderSettings() { return loadJson(REMINDER_KEY,{time:"20:00",enabled:false}); }
function saveReminderSettings(next) { saveJson(REMINDER_KEY,next); }
function reminderMessage(person,date) {
  const info=shiftInfo(person,isoLocal(date));
  if (info.category==="none") return null;
  const tomorrowWord=dateLabel(date,{weekday:"long"});
  const title=info.category==="morning" ? "Yarın sabahçısın ☀️" : info.category==="evening" ? "Yarın akşam vardiyasındasın" : info.category==="night" ? "Yarın gece vardiyasındasın 🌙" : info.category==="off" ? "Yarın izinlisin" : info.category==="annual" ? "Yarın yıllık izindesin" : `Yarın: ${info.label}`;
  const body=`${tomorrowWord} • ${info.start?info.start+" başlangıç • ":""}Kod: ${info.code}`;
  return {title,body};
}
async function requestNotifications() {
  if (!("Notification" in window)) { toast("Bu tarayıcı bildirim desteklemiyor."); return; }
  const permission=await Notification.requestPermission();
  const settings=reminderSettings(); settings.enabled=permission==="granted"; settings.time=$("reminderTime").value || "20:00"; saveReminderSettings(settings);
  renderNotificationState(); scheduleReminderCheck(); syncServiceWorker();
  toast(permission==="granted"?"Bildirimler açıldı.":"Bildirim izni verilmedi.");
}
async function showNotification(title,body) {
  if (!("Notification" in window) || Notification.permission!=="granted") return false;
  const reg=await navigator.serviceWorker?.ready.catch(()=>null);
  if(reg) await reg.showNotification(title,{body,icon:"icons/icon-192.png",badge:"icons/icon-192.png",tag:"vardiyacep-reminder"});
  else new Notification(title,{body,icon:"icons/icon-192.png"});
  return true;
}
async function testNotification() {
  const p=selectedPerson(); if(!p)return;
  if (!("Notification" in window) || Notification.permission!=="granted") { await requestNotifications(); if(Notification.permission!=="granted")return; }
  const msg=reminderMessage(p,addDays(new Date(),1)) || {title:"VardiyaCep test bildirimi",body:`${p.name} için bildirimler hazır.`};
  await showNotification(msg.title,msg.body); toast("Test bildirimi gönderildi.");
}
function renderNotificationState() {
  const settings=reminderSettings(); $("reminderTime").value=settings.time||"20:00";
  let text="Bildirim izni henüz verilmedi.";
  if (!("Notification" in window)) text="Bu tarayıcı bildirim özelliğini desteklemiyor.";
  else if(Notification.permission==="granted") text=`Bildirim açık. Her gün ${settings.time || "20:00"} saatinde ertesi gün programı kontrol edilir.`;
  else if(Notification.permission==="denied") text="Bildirim izni engellenmiş. Tarayıcı site ayarlarından izin vermeniz gerekir.";
  $("notificationState").textContent=text;
}
function scheduleReminderCheck() {
  clearTimeout(state.notificationTimer);
  const settings=reminderSettings();
  if(!settings.enabled || !state.dataset || !selectedPerson() || !("Notification" in window) || Notification.permission!=="granted")return;
  const [h,m]=(settings.time||"20:00").split(":").map(Number);
  const now=new Date(); const next=new Date(now); next.setHours(h,m,0,0); if(next<=now)next.setDate(next.getDate()+1);
  state.notificationTimer=setTimeout(async()=>{
    const msg=reminderMessage(selectedPerson(),addDays(new Date(),1));
    if(msg) await showNotification(msg.title,msg.body);
    scheduleReminderCheck();
  },Math.min(next-now,2147483647));
}
async function syncServiceWorker() {
  if(!("serviceWorker" in navigator) || !state.dataset || !selectedPerson())return;
  try {
    const reg=await navigator.serviceWorker.ready;
    const settings=reminderSettings();
    reg.active?.postMessage({type:"SAVE_REMINDER",payload:{person:selectedPerson(),mappings:state.mappings,settings}});
    if("periodicSync" in reg && settings.enabled) {
      try { await reg.periodicSync.register("vardiyacep-daily",{minInterval:12*60*60*1000}); } catch {}
    }
  } catch {}
}

function toIcsLocal(date,time) {
  const [h,m]=(time||"09:00").split(":").map(Number);
  return `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,"0")}${String(date.getDate()).padStart(2,"0")}T${String(h).padStart(2,"0")}${String(m).padStart(2,"0")}00`;
}
function icsEscape(value) { return String(value).replace(/\\/g,"\\\\").replace(/,/g,"\\,").replace(/;/g,"\\;").replace(/\n/g,"\\n"); }
function downloadIcs() {
  const p=selectedPerson(); if(!p)return toast("Önce personel seçin.");
  const alarmTime=$("calendarReminderTime").value || "20:00";
  const events=[];
  for(const iso of state.dataset.dates) {
    const info=shiftInfo(p,iso); if(info.category==="none")continue;
    const d=localDate(iso); const uid=`${slugify(p.key || p.id)}-${iso}-${slugify(info.code)}@vardiyacep`;
    let lines=["BEGIN:VEVENT",`UID:${uid}`,`DTSTAMP:${toIcsLocal(new Date(),"00:00")}`,`SUMMARY:${icsEscape(info.label+" ("+info.code+")")}`];
    if(info.start && ["morning","evening","night","other"].includes(info.category)) {
      const end=addDays(d,0); const [h,m]=info.start.split(":").map(Number); end.setHours(h+8,m,0,0);
      lines.push(`DTSTART:${toIcsLocal(d,info.start)}`,`DTEND:${toIcsLocal(end,`${String(end.getHours()).padStart(2,"0")}:${String(end.getMinutes()).padStart(2,"0")}`)}`);
    } else {
      const next=addDays(d,1); lines.push(`DTSTART;VALUE=DATE:${iso.replaceAll("-","")}`,`DTEND;VALUE=DATE:${isoLocal(next).replaceAll("-","")}`);
    }
    const alarmDate=addDays(d,-1);
    lines.push(`DESCRIPTION:${icsEscape(`${p.name} • Kod ${info.code}${info.start?" • "+info.start:""}`)}`,"BEGIN:VALARM",`TRIGGER;VALUE=DATE-TIME:${toIcsLocal(alarmDate,alarmTime)}`,"ACTION:DISPLAY",`DESCRIPTION:${icsEscape("Yarın: "+info.label+" ("+info.code+")")}`,"END:VALARM","END:VEVENT");
    events.push(lines.join("\r\n"));
  }
  if(!events.length)return toast("Aktarılacak program bulunamadı.");
  const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//VardiyaCep//TR","CALSCALE:GREGORIAN","METHOD:PUBLISH",...events,"END:VCALENDAR"].join("\r\n");
  const blob=new Blob([ics],{type:"text/calendar;charset=utf-8"}); const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download=`${slugify(p.name)}-vardiya.ics`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast("Takvim dosyası hazırlandı.");
}

function bindEvents() {
  $("fileInput").addEventListener("change",e=>importFile(e.target.files[0]));
  $("sampleBtn").addEventListener("click",async()=>{
    setParseStatus("Yüklü örnek program açılıyor…",true);
    try { const data=await fetch("sample-data.json").then(r=>{if(!r.ok)throw new Error();return r.json();}); loadDataset(data,true); toast("Örnek vardiya listesi açıldı."); }
    catch { setParseStatus("Örnek veri açılamadı. Uygulamayı bir web sunucusu üzerinden açın veya Excel dosyasını seçin.",false,true); }
  });
  const dz=$("dropZone");
  ["dragenter","dragover"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("drag");}));
  ["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("drag");}));
  dz.addEventListener("drop",e=>importFile(e.dataTransfer.files[0]));
  dz.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" ")$("fileInput").click();});
  $("changeFileBtn").addEventListener("click",()=>{$("appPanel").classList.add("hidden");$("importPanel").classList.remove("hidden");});
  $("personSearch").addEventListener("input",e=>renderPersonSearch(e.target.value));
  $("personSearch").addEventListener("focus",e=>renderPersonSearch(e.target.value));
  document.addEventListener("click",e=>{if(!e.target.closest(".field.grow"))$("personResults").classList.add("hidden");});
  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>switchTab(btn.dataset.tab)));
  $("prevMonthBtn").addEventListener("click",()=>{state.calendarCursor=new Date(state.calendarCursor.getFullYear(),state.calendarCursor.getMonth()-1,1);renderCalendar();});
  $("nextMonthBtn").addEventListener("click",()=>{state.calendarCursor=new Date(state.calendarCursor.getFullYear(),state.calendarCursor.getMonth()+1,1);renderCalendar();});
  $("enableNotificationsBtn").addEventListener("click",requestNotifications);
  $("testNotificationBtn").addEventListener("click",testNotification);
  $("reminderTime").addEventListener("change",e=>{const s=reminderSettings();s.time=e.target.value;s.enabled=Notification.permission==="granted";saveReminderSettings(s);renderNotificationState();scheduleReminderCheck();syncServiceWorker();});
  $("icsBtn").addEventListener("click",downloadIcs); $("icsQuickBtn").addEventListener("click",downloadIcs);
  $("reselectPersonBtn").addEventListener("click",()=>{$("personSearch").focus();renderPersonSearch("");window.scrollTo({top:0,behavior:"smooth"});});
  $("clearDataBtn").addEventListener("click",()=>{if(confirm("Kaydedilen vardiya verileri bu cihazdan silinsin mi?"))clearDataset();});
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.deferredInstall=e;$("installBtn").classList.remove("hidden");});
  $("installBtn").addEventListener("click",async()=>{if(!state.deferredInstall)return;state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null;$("installBtn").classList.add("hidden");});
}

async function boot() {
  bindEvents();
  // Eski Mart verisinin otomatik geri yüklenmesini engelle.
  ["vardiyacep.dataset.v1", "vardiyacep.dataset.v2", "vardiyacep.dataset.v3", "vardiyacep.dataset.v4"].forEach(key => localStorage.removeItem(key));
  if("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register(`service-worker.js?v=${APP_VERSION}`, {updateViaCache:"none"});
      reg.update().catch(()=>{});
    } catch (error) { console.warn(error); }
  }
  const saved=loadJson(STORAGE_KEY,null);
  if(saved?.people?.length && saved?.dates?.length && saved.appVersion===APP_VERSION) { try{loadDataset(saved,false);}catch{} }
  renderNotificationState();
}
document.addEventListener("DOMContentLoaded",boot);
