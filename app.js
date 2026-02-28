/* NASALPROM PROM Copier
 * - Clinician: Copy TSV for spreadsheet OR readable EPR text
 * - Patient: Email readable results (optional TSV lines)
 *
 * Key safety behaviour:
 * - Allows completing NOSE only, SNOT-22 only, or both.
 * - BUT blocks copy/email if a questionnaire is partially completed (to avoid blank overwrites).
 * - TSV copy is "smart":
 *    - both complete -> FULL block TSV (NOSE+Total + SNOT+Total)
 *    - only NOSE complete -> NOSE-only TSV (6 cols)
 *    - only SNOT complete -> SNOT-only TSV (23 cols)
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

  function todayIso() {
    const now = new Date();
    const y = String(now.getFullYear()).padStart(4, "0");
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
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
      out.push(sel ? Number(sel.value) : null); // null = unanswered
    }
    return out;
  }

  function completionState(scores) {
    // scores: array of number|null
    const answered = scores.filter(v => v !== null).length;
    if (answered === 0) return "empty";
    if (answered === scores.length) return "complete";
    return "partial";
  }

  function assertNotPartialOrThrow(label, scores) {
    const st = completionState(scores);
    if (st === "partial") {
      throw new Error(`${label} is partly completed. Please answer all questions in ${label}, or clear it and leave it blank.`);
    }
    return st; // "empty" or "complete"
  }

  function scoresToNumbers(scores) {
    // convert nulls -> 0, but we only call this when complete (no nulls)
    return scores.map(v => Number(v));
  }

  // TSV builders
  // Full block TSV:
  // NOSE Q1..Q5, NOSE Total, SNOT Q1..Q22, SNOT Total
  function buildFullBlockTSV(noseNums, snotNums) {
    const cols = [
      ...noseNums.map(String),
      String(sum(noseNums)),
      ...snotNums.map(String),
      String(sum(snotNums)),
    ];
    return cols.join("\t");
  }

  // NOSE-only TSV: Q1..Q5, Total
  function buildNoseOnlyTSV(noseNums) {
    const cols = [
      ...noseNums.map(String),
      String(sum(noseNums)),
    ];
    return cols.join("\t");
  }

  // SNOT-only TSV: Q1..Q22, Total
  function buildSnotOnlyTSV(snotNums) {
    const cols = [
      ...snotNums.map(String),
      String(sum(snotNums)),
    ];
    return cols.join("\t");
  }

  function buildEprText(dateIso, timepoint, blockLabel, noseNumsOrNull, snotNumsOrNull) {
    const meta = [];
    if (dateIso) meta.push(`Date: ${ddmmyyyy(dateIso)}`);
    if (timepoint) meta.push(`Timepoint: ${timepoint}`);
    if (blockLabel) meta.push(`Dataset: ${blockLabel}`);

    const lines = [];
    lines.push("PROMs recorded:");
    if (meta.length) lines.push(meta.join(" | "));
    lines.push("");

    if (noseNumsOrNull) {
      const noseTotal = sum(noseNumsOrNull);
      lines.push(`NOSE total: ${noseTotal} / 20`);
      NOSE_ITEMS.forEach((t, i) => lines.push(`- ${t}: ${noseNumsOrNull[i]}`));
      lines.push("");
    }

    if (snotNumsOrNull) {
      const snotTotal = sum(snotNumsOrNull);
      lines.push(`SNOT-22 total: ${snotTotal} / 110`);
      SNOT_ITEMS.forEach((t, i) => lines.push(`- ${t}: ${snotNumsOrNull[i]}`));
      lines.push("");
    }

    // Trim trailing blank line
    while (lines.length && lines[lines.length - 1] === "") lines.pop();

    return lines.join("\n");
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
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

  // Decide what TSV to output based on completion state
  function buildSmartTSV(noseScores, snotScores) {
    const noseState = assertNotPartialOrThrow("NOSE", noseScores);
    const snotState = assertNotPartialOrThrow("SNOT-22", snotScores);

    if (noseState === "empty" && snotState === "empty") {
      throw new Error("Please complete NOSE and/or SNOT-22 before copying.");
    }

    if (noseState === "complete" && snotState === "complete") {
      const noseNums = scoresToNumbers(noseScores);
      const snotNums = scoresToNumbers(snotScores);
      return {
        mode: "full",
        tsv: buildFullBlockTSV(noseNums, snotNums),
        noseNums,
        snotNums
      };
    }

    if (noseState === "complete") {
      const noseNums = scoresToNumbers(noseScores);
      return {
        mode: "nose",
        tsv: buildNoseOnlyTSV(noseNums),
        noseNums,
        snotNums: null
      };
    }

    // snot only
    const snotNums = scoresToNumbers(snotScores);
    return {
      mode: "snot",
      tsv: buildSnotOnlyTSV(snotNums),
      noseNums: null,
      snotNums
    };
  }

  function mountClinician(config = {}) {
    const onChange = () => {
      const noseScores = getScores("nose_", NOSE_ITEMS.length);
      const snotScores = getScores("snot_", SNOT_ITEMS.length);

      // Totals: show sums for answered items only (ignores nulls)
      const noseAnswered = noseScores.filter(v => v !== null).map(Number);
      const snotAnswered = snotScores.filter(v => v !== null).map(Number);

      const noseTotalEl = document.getElementById("noseTotal");
      const snotTotalEl = document.getElementById("snotTotal");
      if (noseTotalEl) noseTotalEl.textContent = String(sum(noseAnswered));
      if (snotTotalEl) snotTotalEl.textContent = String(sum(snotAnswered));

      // Preview: show what TSV would be if valid; otherwise show helpful hint
      const preview = document.getElementById("preview");
      if (!preview) return;

      try {
        const { tsv } = buildSmartTSV(noseScores, snotScores);
        preview.value = tsv;
      } catch (e) {
        preview.value = e.message;
      }
    };

    addQuestions("noseQs", NOSE_ITEMS, "nose_", 4, onChange);
    addQuestions("snotQs", SNOT_ITEMS, "snot_", 5, onChange);

    // Default date to today on clinician page too
    const dateEl = document.getElementById("date");
    if (dateEl && !dateEl.value) dateEl.value = todayIso();

    onChange();

    const copySheetBtn = document.getElementById("copySheet");
    const copyEprBtn = document.getElementById("copyEpr");
    const resetBtn = document.getElementById("reset");

    if (copySheetBtn) {
      copySheetBtn.addEventListener("click", async () => {
        const noseScores = getScores("nose_", NOSE_ITEMS.length);
        const snotScores = getScores("snot_", SNOT_ITEMS.length);

        let result;
        try {
          result = buildSmartTSV(noseScores, snotScores);
        } catch (e) {
          alert(e.message);
          return;
        }

        const preview = document.getElementById("preview");
        if (preview) preview.value = result.tsv;

        await copyToClipboard(result.tsv);

        if (result.mode === "full") {
          alert("Copied FULL TSV. Paste into the first cell of the correct PROM block (baseline or follow-up).");
        } else if (result.mode === "nose") {
          alert("Copied NOSE TSV only. Paste into the first NOSE cell of the correct block (won’t affect SNOT-22 cells).");
        } else {
          alert("Copied SNOT-22 TSV only. Paste into the first SNOT-22 cell of the correct block (won’t affect NOSE cells).");
        }
      });
    }

    if (copyEprBtn) {
      copyEprBtn.addEventListener("click", async () => {
        const dateIso = (document.getElementById("date") || {}).value || "";
        const timepoint = (document.getElementById("timepoint") || {}).value || "";

        // This selector is useful for EPR context only
        const blockSel = document.getElementById("block");
        const block = blockSel ? blockSel.value : "baseline";
        const blockLabel = block === "followup" ? "Follow-up" : "Baseline";

        const noseScores = getScores("nose_", NOSE_ITEMS.length);
        const snotScores = getScores("snot_", SNOT_ITEMS.length);

        // For EPR we also enforce "no partial questionnaires"
        let noseState, snotState;
        try {
          noseState = assertNotPartialOrThrow("NOSE", noseScores);
          snotState = assertNotPartialOrThrow("SNOT-22", snotScores);
        } catch (e) {
          alert(e.message);
          return;
        }
        if (noseState === "empty" && snotState === "empty") {
          alert("Please complete NOSE and/or SNOT-22 before copying EPR text.");
          return;
        }

        const noseNums = noseState === "complete" ? scoresToNumbers(noseScores) : null;
        const snotNums = snotState === "complete" ? scoresToNumbers(snotScores) : null;

        const txt = buildEprText(dateIso, timepoint, blockLabel, noseNums, snotNums);

        const preview = document.getElementById("preview");
        if (preview) preview.value = txt;

        await copyToClipboard(txt);
        alert("Copied EPR text.");
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        resetRadios();
        const dateEl2 = document.getElementById("date");
        if (dateEl2) dateEl2.value = todayIso();
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
      const noseScores = getScores("nose_", NOSE_ITEMS.length);
      const snotScores = getScores("snot_", SNOT_ITEMS.length);

      const noseAnswered = noseScores.filter(v => v !== null).map(Number);
      const snotAnswered = snotScores.filter(v => v !== null).map(Number);

      const noseTotalEl = document.getElementById("noseTotal");
      const snotTotalEl = document.getElementById("snotTotal");
      if (noseTotalEl) noseTotalEl.textContent = String(sum(noseAnswered));
      if (snotTotalEl) snotTotalEl.textContent = String(sum(snotAnswered));

      const preview = document.getElementById("preview");
      if (!preview) return;

      const dateIso = (document.getElementById("p_date") || {}).value || "";
      const timepoint = (document.getElementById("p_timepoint") || {}).value || "";

      // For preview, show what would be sent (but keep it readable)
      try {
        const noseState = assertNotPartialOrThrow("NOSE", noseScores);
        const snotState = assertNotPartialOrThrow("SNOT-22", snotScores);

        const noseNums = noseState === "complete" ? scoresToNumbers(noseScores) : null;
        const snotNums = snotState === "complete" ? scoresToNumbers(snotScores) : null;

        if (!noseNums && !snotNums) {
          preview.value = "Complete NOSE and/or SNOT-22, then tap Email results.";
          return;
        }

        const readable = buildEprText(dateIso, timepoint, "", noseNums, snotNums);

        if (!includeTsvLine) {
          preview.value = readable;
          return;
        }

        const tsvBits = [];
        if (noseNums && snotNums) {
          tsvBits.push(`FULL TSV (paste into first PROM cell of block):\n${buildFullBlockTSV(noseNums, snotNums)}`);
        } else if (noseNums) {
          tsvBits.push(`NOSE TSV only (paste into first NOSE cell of block):\n${buildNoseOnlyTSV(noseNums)}`);
        } else if (snotNums) {
          tsvBits.push(`SNOT-22 TSV only (paste into first SNOT-22 cell of block):\n${buildSnotOnlyTSV(snotNums)}`);
        }

        preview.value = `${readable}\n\n${tsvBits.join("\n\n")}`;
      } catch (e) {
        preview.value = e.message;
      }
    };

    addQuestions("noseQs", NOSE_ITEMS, "nose_", 4, onChange);
    addQuestions("snotQs", SNOT_ITEMS, "snot_", 5, onChange);

    // Default date to today on patient page
    const d = document.getElementById("p_date");
    if (d && !d.value) d.value = todayIso();

    onChange();

    const emailBtn = document.getElementById("emailResults");
    const copyBtn = document.getElementById("copyPatientText");
    const resetBtn = document.getElementById("reset");

    function buildPatientMessageOrThrow() {
      const dateIso = (document.getElementById("p_date") || {}).value || "";
      const timepoint = (document.getElementById("p_timepoint") || {}).value || "";

      const noseScores = getScores("nose_", NOSE_ITEMS.length);
      const snotScores = getScores("snot_", SNOT_ITEMS.length);

      const noseState = assertNotPartialOrThrow("NOSE", noseScores);
      const snotState = assertNotPartialOrThrow("SNOT-22", snotScores);

      if (noseState === "empty" && snotState === "empty") {
        throw new Error("Please complete NOSE and/or SNOT-22 before emailing results.");
      }

      const noseNums = noseState === "complete" ? scoresToNumbers(noseScores) : null;
      const snotNums = snotState === "complete" ? scoresToNumbers(snotScores) : null;

      const readable = buildEprText(dateIso, timepoint, "", noseNums, snotNums);

      const subjectParts = ["NASALPROM PROMs"];
      if (dateIso) subjectParts.push(ddmmyyyy(dateIso));
      if (timepoint) subjectParts.push(timepoint);
      const subject = subjectParts.join(" – ");

      if (!includeTsvLine) {
        return { subject, body: `${readable}\n` };
      }

      const tsvBits = [];
      if (noseNums && snotNums) {
        tsvBits.push(`FULL TSV (paste into first PROM cell of block):\n${buildFullBlockTSV(noseNums, snotNums)}`);
      } else if (noseNums) {
        tsvBits.push(`NOSE TSV only (paste into first NOSE cell of block):\n${buildNoseOnlyTSV(noseNums)}`);
      } else if (snotNums) {
        tsvBits.push(`SNOT-22 TSV only (paste into first SNOT-22 cell of block):\n${buildSnotOnlyTSV(snotNums)}`);
      }

      const body = `${readable}\n\n${tsvBits.join("\n\n")}\n`;
      return { subject, body };
    }

    if (emailBtn) {
      emailBtn.addEventListener("click", () => {
        let msg;
        try {
          msg = buildPatientMessageOrThrow();
        } catch (e) {
          alert(e.message);
          return;
        }
        const mailto =
          `mailto:${encodeURIComponent(emailTo)}` +
          `?subject=${encodeURIComponent(msg.subject)}` +
          `&body=${encodeURIComponent(msg.body)}`;
        window.location.href = mailto;
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        let msg;
        try {
          msg = buildPatientMessageOrThrow();
        } catch (e) {
          alert(e.message);
          return;
        }
        const preview = document.getElementById("preview");
        if (preview) preview.value = msg.body;
        await copyToClipboard(msg.body);
        alert("Copied results text.");
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        resetRadios();
        const tp = document.getElementById("p_timepoint");
        if (tp) tp.value = "Pre-op";
        const d2 = document.getElementById("p_date");
        if (d2) d2.value = todayIso();
        onChange();
      });
    }
  }

  return { mountClinician, mountPatient };
})();