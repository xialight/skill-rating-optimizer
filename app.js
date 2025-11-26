// ---------------- CONFIG ----------------
const SKILL_TYPES = ["Yellow", "Special", "Blue", "Red", "Green", "Inherit", "Purple"];

const SKILL_FILES = {
  Yellow: "data/yellow.json",
  Special: "data/special.json",
  Blue: "data/blue.json",
  Red: "data/red.json",
  Green: "data/green.json",
  Inherit: "data/inherit.json",
  Purple: "data/purple.json"
};

// Aptitudes (keys are ID-safe; labels match JSON aptitude strings)
const APTITUDES = [
  { key: "Turf",        label: "Turf" },
  { key: "Dirt",        label: "Dirt" },

  { key: "Sprint",      label: "Sprint" },
  { key: "Mile",        label: "Mile" },
  { key: "Medium",      label: "Medium" },
  { key: "Long",        label: "Long" },

  { key: "Front",       label: "Front" },         // JSON uses "Front"
  { key: "Pace_Chaser", label: "Pace Chaser" },
  { key: "Late_Surger", label: "Late Surger" },
  { key: "End_Closer",  label: "End Closer" }
];

const GRADE_KEYS = ["S-A", "B-C", "D-E-F", "G"];

// ---------------- STATE ----------------
// Each skill:
// { type, name, variant, ratingBase, aptitude, grades, spCost, groupId, use }
let ALL_SKILLS = [];
let activeType = "Yellow";
let GROUP_COUNTER = 0;

// ---------------- DOM ----------------
const tabsRow = document.getElementById("tabsRow");
const skillsBody = document.getElementById("skillsBody");
const skillsEmpty = document.getElementById("skillsEmpty");
const optimizeBtn = document.getElementById("optimizeBtn");
const budgetInput = document.getElementById("budgetInput");
const errorBox = document.getElementById("errorBox");
const resultsSection = document.getElementById("resultsSection");
const statRating = document.getElementById("statRating");
const statSP = document.getElementById("statSP");
const statCount = document.getElementById("statCount");
const statEfficiency = document.getElementById("statEfficiency");
const statPurple = document.getElementById("statPurple");
const chosenList = document.getElementById("chosenList");
const resetSkillsBtn = document.getElementById("resetSkillsBtn");
const resetAllBtn = document.getElementById("resetAllBtn");

// ---------------- HELPERS ----------------
function getAptitudeGrades() {
  const map = {};
  for (const { key, label } of APTITUDES) {
    const el = document.getElementById("apt-" + key);
    const grade = el ? el.value : "S-A";
    map[label] = grade;
  }
  return map;
}

// ratingBase from JSON "value"-style fields
function computeSkillRating(skill, gradeMap) {
  if (skill.aptitude && gradeMap[skill.aptitude]) {
    const grade = gradeMap[skill.aptitude];
    const value = skill.grades[grade];
    if (value != null && !Number.isNaN(value)) {
      return value;
    }
  }
  return Number.isFinite(skill.ratingBase) ? skill.ratingBase : 0;
}

function createTabs() {
  tabsRow.innerHTML = "";
  for (const type of SKILL_TYPES) {
    const btn = document.createElement("button");
    btn.className = "tab-btn" + (type === activeType ? " active" : "");
    btn.textContent = type;
    btn.dataset.type = type;
    btn.addEventListener("click", () => {
      // Save SP entries before switching
      syncSpCostsFromDom();
      activeType = type;
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderSkillsTable();
    });
    tabsRow.appendChild(btn);
  }
}

function renderSkillsTable() {
  const gradeMap = getAptitudeGrades();
  const rows = ALL_SKILLS.filter(s => s.type === activeType);
  skillsBody.innerHTML = "";

  if (rows.length === 0) {
    skillsEmpty.style.display = "block";
    return;
  }
  skillsEmpty.style.display = "none";

  for (const s of rows) {
    const tr = document.createElement("tr");
    const rawRating = computeSkillRating(s, gradeMap);
    const displayRating = s.type === "Purple" ? -rawRating : rawRating; // show minus for purple
    const gradeUsed = s.aptitude ? gradeMap[s.aptitude] : "-";
    const idx = ALL_SKILLS.indexOf(s);

    // SP cost cell (Purple always 0 and not editable)
    let costCellHtml;
    if (s.type === "Purple") {
      costCellHtml = "0";
    } else {
      const val = s.spCost != null ? s.spCost : "";
      costCellHtml = `
        <input type="number"
               min="0"
               step="1"
               class="sp-cost-input"
               data-skill-index="${idx}"
               value="${val}">
      `;
    }

    // Name cell (Purple adds checkbox)
    let nameCellHtml;
    if (s.type === "Purple") {
      const checked = s.use ? "checked" : "";
      nameCellHtml = `
        <label>
          <input type="checkbox"
                 class="purple-toggle"
                 data-skill-index="${idx}"
                 ${checked}>
          ${s.name}
        </label>
      `;
    } else {
      nameCellHtml = s.name;
    }

    tr.innerHTML = `
      <td>${nameCellHtml}</td>
      <td><span class="variant-pill variant-${s.variant}">${s.variant}</span></td>
      <td>${costCellHtml}</td>
      <td>${s.aptitude || "-"}</td>
      <td>${gradeUsed}</td>
      <td>${displayRating.toFixed(2)}</td>
    `;
    skillsBody.appendChild(tr);
  }
}

// Sync SP cost inputs into ALL_SKILLS
function syncSpCostsFromDom() {
  document.querySelectorAll(".sp-cost-input").forEach(input => {
    const idx = parseInt(input.dataset.skillIndex, 10);
    if (Number.isNaN(idx) || !ALL_SKILLS[idx]) return;
    const raw = parseInt(input.value, 10);
    const val = Number.isNaN(raw) || raw <= 0 ? 0 : raw;
    ALL_SKILLS[idx].spCost = val;
  });
}

// ---------------- DATA LOADING ----------------
async function loadAllSkills() {
  const promises = SKILL_TYPES.map(type => loadSkillsForType(type));
  await Promise.all(promises);
  createTabs();
  renderSkillsTable();
}

async function loadSkillsForType(type) {
  const path = SKILL_FILES[type];
  if (!path) return;
  try {
    const res = await fetch(path);
    if (!res.ok) {
      console.warn(`[Skills] No file or bad response for type ${type}: ${res.status}`);
      return;
    }
    const data = await res.json();
    parseBlocksJson(data, type);
  } catch (e) {
    console.error(`[Skills] Error loading JSON for type ${type}:`, e);
    errorBox.textContent = `Error loading data for ${type}: ${e.message}`;
    errorBox.style.display = "block";
  }
}

/**
 * Expected JSON format per file:
 *
 * {
 *   "blocks": [
 *     {
 *       "aptitude": "Mile" or "",
 *       "baseValue": 69,
 *       "baseRatings": { "S-A": 239, "B-C": 195, "D-E-F": 174, "G": 152 },
 *       "goldValue": 69,
 *       "goldRatings": { "S-A": 367, "B-C": 301, "D-E-F": 267, "G": 234 },
 *       "pairs": [
 *         ["Base Skill Name", "Gold Skill Name"],
 *         ["Base Only Skill", null],
 *         ["Another Base Only Skill"]
 *       ]
 *     },
 *     ...
 *   ]
 * }
 */
function parseBlocksJson(data, type) {
  if (!data || !Array.isArray(data.blocks)) {
    console.warn(`[Skills] JSON for type ${type} missing "blocks" array.`);
    return;
  }

  for (const block of data.blocks) {
    const aptitude = block.aptitude || "";

    const baseValue = Number(block.baseValue) || 0;
    const baseRatings = block.baseRatings || {};
    const baseProfile = {
      ratingBase: baseValue,
      grades: {
        "S-A": toNumberOrNull(baseRatings["S-A"]),
        "B-C": toNumberOrNull(baseRatings["B-C"]),
        "D-E-F": toNumberOrNull(baseRatings["D-E-F"]),
        "G": toNumberOrNull(baseRatings["G"])
      }
    };

    // Gold profile is optional
    let goldProfile = null;
    if (block.goldValue !== undefined || block.goldRatings !== undefined) {
      const goldValue = Number(block.goldValue) || 0;
      const goldRatings = block.goldRatings || {};
      goldProfile = {
        ratingBase: goldValue,
        grades: {
          "S-A": toNumberOrNull(goldRatings["S-A"]),
          "B-C": toNumberOrNull(goldRatings["B-C"]),
          "D-E-F": toNumberOrNull(goldRatings["D-E-F"]),
          "G": toNumberOrNull(goldRatings["G"])
        }
      };
    }

    const pairs = Array.isArray(block.pairs) ? block.pairs : [];
    for (const pair of pairs) {
      if (!Array.isArray(pair) || pair.length === 0) continue;
      const baseName = pair[0];
      const goldName = pair[1]; // may be null/undefined

      const groupId = GROUP_COUNTER++;

      // Base/Normal skill
      if (baseName) {
        ALL_SKILLS.push({
          type,
          name: baseName,
          variant: "Base",  // displayed pill text; CSS .variant-Normal
          ratingBase: baseProfile.ratingBase,
          aptitude,
          grades: baseProfile.grades,
          spCost: null,
          groupId,
          use: false // not used for non-purple; safe to keep
        });
      }

      // Gold skill (if present)
      if (goldName && goldProfile) {
        ALL_SKILLS.push({
          type,
          name: goldName,
          variant: "Gold",
          ratingBase: goldProfile.ratingBase,
          aptitude,
          grades: goldProfile.grades,
          spCost: null,
          groupId,
          use: false
        });
      }
    }
  }
}

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const num = Number(v);
  return Number.isNaN(num) ? null : num;
}

// ---------------- OPTIMIZER (multiple-choice knapsack) ----------------
function optimize() {
  errorBox.style.display = "none";
  const budgetRaw = parseInt(budgetInput.value, 10);
  const budget = Number.isNaN(budgetRaw) || budgetRaw < 0 ? 0 : budgetRaw;

  if (budget <= 0) {
    errorBox.textContent = "Please enter a positive SP budget.";
    errorBox.style.display = "block";
    resultsSection.style.display = "none";
    return;
  }

  // Save SP costs first
  syncSpCostsFromDom();
  const gradeMap = getAptitudeGrades();

  // Group non-purple skills by groupId; only skills with SP cost > 0 are candidates
  const groupsMap = new Map();
  for (const s of ALL_SKILLS) {
    if (s.type === "Purple") continue;

    const cost = s.spCost != null ? s.spCost : 0;
    if (cost <= 0) continue;

    const rating = computeSkillRating(s, gradeMap);
    const gid = s.groupId != null ? s.groupId : s.name + ":" + s.variant;
    if (!groupsMap.has(gid)) groupsMap.set(gid, []);
    groupsMap.get(gid).push({ skill: s, cost, rating });
  }

  const groupList = Array.from(groupsMap.values());
  const G = groupList.length;

  if (G === 0) {
    errorBox.textContent = "No skills with SP cost set. Enter SP cost for the skills you can buy.";
    errorBox.style.display = "block";
    resultsSection.style.display = "none";
    return;
  }

  if (G * budget * 2 > 2_000_000) {
    errorBox.textContent =
      "This SP budget and skill count are too large for the browser. Try reducing the budget or the number of available skills.";
    errorBox.style.display = "block";
    resultsSection.style.display = "none";
    return;
  }

  // Multiple-choice knapsack: at most one item per group
  const dp = Array.from({ length: G + 1 }, () => new Float64Array(budget + 1));
  const choice = Array.from({ length: G + 1 }, () => new Int16Array(budget + 1).fill(-1));

  for (let g = 1; g <= G; g++) {
    const group = groupList[g - 1];
    for (let sp = 0; sp <= budget; sp++) {
      let best = dp[g - 1][sp];
      let chosenIdx = -1;

      for (let k = 0; k < group.length; k++) {
        const { cost, rating } = group[k];
        if (cost <= sp) {
          const candidate = dp[g - 1][sp - cost] + rating;
          if (candidate > best) {
            best = candidate;
            chosenIdx = k;
          }
        }
      }

      dp[g][sp] = best;
      choice[g][sp] = chosenIdx;
    }
  }

  // Reconstruct chosen skills
  let remainingSP = budget;
  const chosenItems = [];
  for (let g = G; g >= 1; g--) {
    const chosenIdx = choice[g][remainingSP];
    if (chosenIdx >= 0) {
      const item = groupList[g - 1][chosenIdx];
      chosenItems.push(item);
      remainingSP -= item.cost;
    }
  }
  chosenItems.reverse();

  let usedSP = 0;
  let totalRating = 0;
  chosenList.innerHTML = "";

  for (const it of chosenItems) {
    const s = it.skill;
    usedSP += it.cost;
    totalRating += it.rating;
    const gradeUsed = s.aptitude ? getAptitudeGrades()[s.aptitude] : "-";

    const li = document.createElement("li");
    li.innerHTML = `
      <span class="highlight">${s.name}</span>
      <span class="pill-small variant-pill variant-${s.variant}">${s.variant}</span>
      <span class="pill-small">Cost: ${it.cost}</span>
      <span class="pill-small">Rating: ${it.rating.toFixed(2)}</span>
      ${s.aptitude ? `<span class="pill-small">${s.aptitude} (${gradeUsed})</span>` : ""}
    `;
    chosenList.appendChild(li);
  }

  // Purple penalty for checked purple skills
  let purplePenalty = 0;
  const gradeMapNow = getAptitudeGrades();
  for (const s of ALL_SKILLS.filter(x => x.type === "Purple" && x.use)) {
    const r = computeSkillRating(s, gradeMapNow);
    purplePenalty -= r;
  }

  const finalRating = totalRating + purplePenalty;

  statRating.textContent = finalRating.toFixed(2);
  statSP.textContent = `${usedSP} / ${budget}`;
  statCount.textContent = chosenItems.length.toString();
  statEfficiency.textContent = usedSP > 0 ? (finalRating / usedSP).toFixed(4) : "0";
  statPurple.textContent = purplePenalty.toFixed(2);

  resultsSection.style.display = "grid";
}

// ---------------- RESET LOGIC ----------------
function clearResults() {
  resultsSection.style.display = "none";
  errorBox.style.display = "none";
  chosenList.innerHTML = "";
  statRating.textContent = "0";
  statSP.textContent = "0 / 0";
  statCount.textContent = "0";
  statEfficiency.textContent = "0";
  statPurple.textContent = "0";
}

function resetSkills() {
  if (!confirm("Reset all SP costs, purple toggles, and results?")) return;

  ALL_SKILLS.forEach(s => {
    if (s.type !== "Purple") {
      s.spCost = null;
    }
    if (s.type === "Purple") {
      s.use = false;
    }
  });

  clearResults();
  renderSkillsTable();
}

function resetAll() {
  if (!confirm("Reset ALL settings, skills, aptitudes, and results?")) return;

  ALL_SKILLS.forEach(s => {
    if (s.type !== "Purple") s.spCost = null;
    if (s.type === "Purple") s.use = false;
  });

  APTITUDES.forEach(({ key }) => {
    const sel = document.getElementById("apt-" + key);
    if (sel) sel.value = "S-A";
  });

  clearResults();
  renderSkillsTable();
}

// ---------------- INIT & EVENTS ----------------
function wireAptitudeListeners() {
  document.querySelectorAll(".apt-select").forEach(sel => {
    sel.addEventListener("change", () => {
      syncSpCostsFromDom();
      renderSkillsTable();
    });
  });
}

optimizeBtn.addEventListener("click", optimize);
resetSkillsBtn.addEventListener("click", resetSkills);
resetAllBtn.addEventListener("click", resetAll);
wireAptitudeListeners();

// Purple toggle handling (event delegation)
document.addEventListener("change", (event) => {
  const target = event.target;
  if (!target.classList.contains("purple-toggle")) return;
  const idx = parseInt(target.dataset.skillIndex, 10);
  if (Number.isNaN(idx) || !ALL_SKILLS[idx]) return;
  ALL_SKILLS[idx].use = target.checked;
});

loadAllSkills();
