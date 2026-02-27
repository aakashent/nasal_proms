/* NASALPROM PROM Copier
 * - Clinician: copy TSV for spreadsheet OR readable EPR text
 * - Patient: email readable results (optional TSV line at bottom)
 */

const NasalPromApp = (() => {
  // NOSE order (as per your sheet)
  const NOSE_ITEMS = [
    "Nasal congestion",
    "Nasal obstruction",
    "Trouble breathing through nose",
    "Trouble sleeping",
    "Unable to get enough air through nose during exercise",
  ];

  // SNOT-22 order (as per your sheet)
  const SNOT_ITEMS = [
    "Need to blow nose",
    "Sneezing",
    "Runny nose",
    "Nasal obstruction",
    "Loss of smell or taste",
    "Cough",
    "Post-nasal discharge",
    "Thick nasal discharge",
    "Ear fullness",
    "Dizziness",
    "Ear pain",
    "Facial pain/pressure",
    "Difficulty falling asleep",
    "Waking up at night",
    "Lack of a good night’s sleep",
    "Waking up tired",
    "Fatigue",
    "Reduced productivity",
    "Reduced concentration",
    "Frustrated/restless/irritable",
    "Sad",
    "Embarrassed",
  ];

  function sum(arr) { return arr.reduce((a, b) => a + b, 0); }

  function ddmmyyyy(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }

  function makeRadioRow(name, max, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "opts";
    for (let i = 0; i <= max; i++) {
      const lab = document.createElement("label");
      lab.className = "opt";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = String(i);
      input.addEventListener("change", onChange);
      lab.appendChild(input);
      lab.appendChild(document.createTextNode(i));
      wrap.appendChild(lab);
    }
    return wrap;
  }

  function addQuestions(containerId, items, prefix, maxScore, onChange) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = "";
    items.forEach((txt, idx) => {
      const q = document.createElement("div");
      q.className = "q";

      const title = document.createElement("div");
      title.className = "qtitle";
      title.textContent = `${idx + 1}. ${txt}`;
      q.appendChild(title);

      q.appendChild(makeRadioRow(`${prefix}${idx}`, maxScore, onChange));
      box.appendChild(q);
    });
  }

  function getScores(prefix, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const sel = document.querySelector(`input[name="${prefix}${i}"]:checked`);
      out.push(sel ? Number(sel.value) : 0);
    }
    return out;
  }

  // TSV columns for a single PROM block:
  // NOSE Q1..Q5, NOSE Total, SNOT Q1..Q22, SNOT Total
  function buildBlockTSV(noseScores, snotScores) {
    const cols = [
      ...noseScores.map(String),
      String(sum(noseScores)),
      ...snotScores.map(String),
      String(sum(snotScores)),
    ];
    return cols.join("\t");
  }

  // Clinician: if baseline vs follow-up, we still build *the same block* TSV;
  // you paste into the appropriate block start cell.
  function buildEprText(dateIso, timepoint, noseScores, snotScores) {
    const noseTotal = sum(noseScores);
    const snotTotal = sum(snotScores);

    const meta = [];
    if (dateIso) meta.push(`Date: ${ddmmyyyy(dateIso)}`);
    if (timepoint) meta.push(`Timepoint: ${timepoint}`);

    const lines = [];
    lines.push("PROMs recorded:");
    if (meta.length) lines.push(meta.join(" | "));
    lines.push("");
    lines.push(`NOSE total: ${noseTotal} / 20`);
    NOSE_ITEMS.forEach((t, i) => lines.push(`- ${t}: ${noseScores[i]}`));
    lines.push("");
    lines.push(`SNOT-22 total: ${snotTotal} / 110`);
    SNOT_ITEMS.forEach((t, i) => lines.push(`- ${t}: ${snotScores[i]}`));
    return lines.join("\n");
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Fallback for older browsers / some iOS contexts
      const ta = document.getElementById("preview");
      if (!ta) return false;
      ta.value = text;
      ta.focus();
      ta.select();
      document.execCommand("copy");
      return true;
    }
  }

  function resetRadios() {
    document.querySelectorAll('input[type="radio"]').forEach(r => (r.checked = false));
  }

  function mountClinician(config = {}) {
    const onChange = () => {
      const nose = getScores("nose_", NOSE_ITEMS.length);
      const snot = getScores("snot_", SNOT_ITEMS.length);
      const noseTotalEl = document.getElementById("noseTotal");
      const snotTotalEl = document.getElementById("snotTotal");
      if (noseTotalEl) noseTotalEl.textContent = String(sum(nose));
      if (snotTotalEl) snotTotalEl.textContent = String(sum(snot));

      const preview = document.getElementById("preview");
      if (preview) preview.value = buildBlockTSV(nose, snot);
    };

    addQuestions("noseQs", NOSE_ITEMS, "nose_", 4, onChange);
    addQuestions("snotQs", SNOT_ITEMS, "snot_", 5, onChange);
    onChange();

    const copySheetBtn = document.getElementById("copySheet");
    const copyEprBtn = document.getElementById("copyEpr");
    const resetBtn = document.getElementById("reset");

    if (copySheetBtn) {
      copySheetBtn.addEventListener("click", async () => {
        const nose = getScores("nose_", NOSE_ITEMS.length);
        const snot = getScores("snot_", SNOT_ITEMS.length);
        const tsv = buildBlockTSV(nose, snot);

        const preview = document.getElementById("preview");
        if (preview) preview.value = tsv;

        await copyToClipboard(tsv);

        const blockSel = document.getElementById("block");
        const block = blockSel ? blockSel.value : "baseline";
        alert(`Copied TSV. Paste into the first PROM cell of the ${block === "followup" ? "FOLLOW-UP" : "BASELINE"} block.`);
      });
    }

    if (copyEprBtn) {
      copyEprBtn.addEventListener("click", async () => {
        const dateIso = (document.getElementById("date") || {}).value || "";
        const timepoint = (document.getElementById("timepoint") || {}).value || "";
        const nose = getScores("nose_", NOSE_ITEMS.length);
        const snot = getScores("snot_", SNOT_ITEMS.length);

        const txt = buildEprText(dateIso, timepoint, nose, snot);

        const preview = document.getElementById("preview");
        if (preview) preview.value = txt;

        await copyToClipboard(txt);
        alert("Copied EPR text.");
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        resetRadios();
        const dateEl = document.getElementById("date");
        if (dateEl) dateEl.value = "";
        const tpEl = document.getElementById("timepoint");
        if (tpEl) tpEl.value = "Pre-op";
        const blockEl = document.getElementById("block");
        if (blockEl) blockEl.value = "baseline";
        onChange();
      });
    }
  }

  function mountPatient(config = {}) {
    const emailTo = config.emailTo || "nasalprom@yourorganisation.example";
    const includeTsvLine = config.includeTsvLine !== false; // default true

    const onChange = () => {
      const nose = getScores("nose_", NOSE_ITEMS.length);
      const snot = getScores("snot_", SNOT_ITEMS.length);
      const noseTotalEl = document.getElementById("noseTotal");
      const snotTotalEl = document.getElementById("snotTotal");
      if (noseTotalEl) noseTotalEl.textContent = String(sum(nose));
      if (snotTotalEl) snotTotalEl.textContent = String(sum(snot));

      const dateIso = (document.getElementById("p_date") || {}).value || "";
      const timepoint = (document.getElementById("p_timepoint") || {}).value || "";
      const txt = buildEprText(dateIso, timepoint, nose, snot);

      const preview = document.getElementById("preview");
      if (preview) preview.value = includeTsvLine
        ? `${txt}\n\nTSV (for admin paste):\n${buildBlockTSV(nose, snot)}`
        : txt;
    };

    addQuestions("noseQs", NOSE_ITEMS, "nose_", 4, onChange);
    addQuestions("snotQs", SNOT_ITEMS, "snot_", 5, onChange);

    // sensible default date = today
    const d = document.getElementById("p_date");
    if (d && !d.value) {
      const now = new Date();
      const y = String(now.getFullYear()).padStart(4, "0");
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      d.value = `${y}-${m}-${day}`;
    }

    onChange();

    const emailBtn = document.getElementById("emailResults");
    const copyBtn = document.getElementById("copyPatientText");
    const resetBtn = document.getElementById("reset");

    function buildEmail() {
      const dateIso = (document.getElementById("p_date") || {}).value || "";
      const timepoint = (document.getElementById("p_timepoint") || {}).value || "";
      const nose = getScores("nose_", NOSE_ITEMS.length);
      const snot = getScores("snot_", SNOT_ITEMS.length);

      const readable = buildEprText(dateIso, timepoint, nose, snot);
      const tsv = buildBlockTSV(nose, snot);

      const subjectParts = ["NASALPROM PROMs"];
      if (dateIso) subjectParts.push(ddmmyyyy(dateIso));
      if (timepoint) subjectParts.push(timepoint);
      const subject = subjectParts.join(" – ");

      const body = includeTsvLine
        ? `${readable}\n\nTSV (for admin paste):\n${tsv}\n`
        : `${readable}\n`;

      return { subject, body };
    }

    if (emailBtn) {
      emailBtn.addEventListener("click", () => {
        const { subject, body } = buildEmail();
        const mailto = `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailto;
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        const { body } = buildEmail();
        const preview = document.getElementById("preview");
        if (preview) preview.value = body;
        await copyToClipboard(body);
        alert("Copied results text.");
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        resetRadios();
        const tp = document.getElementById("p_timepoint");
        if (tp) tp.value = "Pre-op";
        onChange();
      });
    }
  }

  return {
    mountClinician,
    mountPatient
  };
})();