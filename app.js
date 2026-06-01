"use strict";

const PAGE_SIZE = 8;
const ROTATE_MS = 4600;
const CANDLE_KEY = "memorial-final-candles-v1";

const PHOTO_OVERRIDES = {};

const DESKTOP_POINTS = [
  { x: 16, y: 58, side: "top", size: .80 },
  { x: 28, y: 80, side: "bottom", size: .76 },
  { x: 40, y: 58, side: "top", size: .80 },
  { x: 52, y: 80, side: "bottom", size: .76 },
  { x: 64, y: 58, side: "top", size: .80 },
  { x: 76, y: 80, side: "bottom", size: .76 },
  { x: 88, y: 58, side: "top", size: .80 },
  { x: 8,  y: 80, side: "bottom", size: .76 },
];

const MOBILE_POINTS = [
  { x: 18, y: 53.0, side: "top", size: .58 },
  { x: 18, y: 75.0, side: "bottom", size: .54 },
  { x: 50, y: 53.0, side: "top", size: .58 },
  { x: 50, y: 75.0, side: "bottom", size: .54 },
  { x: 82, y: 53.0, side: "top", size: .58 },
  { x: 82, y: 75.0, side: "bottom", size: .54 },
];

const state = {
  people: [],
  filtered: [],
  visible: [],
  visibleIds: new Set(),
  nextIndex: 0,
  slotCursor: 0,
  history: [],
  paused: false,
  timer: null,
  openPersonId: null,
  focusPersonId: null,
  focusRelatedIds: new Set(),
  focusLocked: false,
  query: "",
};

const els = {
  stage: document.getElementById("memory-stage"),
  layer: document.getElementById("timeline-layer"),
  search: document.getElementById("search-input"),
  prev: document.getElementById("prev-btn"),
  next: document.getElementById("next-btn"),
  pause: document.getElementById("pause-btn"),
  storyRoot: document.getElementById("story-root"),
  announcer: document.getElementById("sr-announcer"),
  pathFill: document.getElementById("path-fill"),
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  Object.entries(attrs).forEach(([key, value]) => {
    if (value === false || value === null || value === undefined) return;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "style") Object.entries(value).forEach(([k, v]) => node.style.setProperty(k, v));
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, String(value));
  });

  children.flat().forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });

  return node;
}

function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function stripMemorialSuffix(name) {
  return String(name || "").replace(/\s*ז"ל\s*$/u, "").trim();
}

function displayNameParts(name) {
  const clean = stripMemorialSuffix(name);
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts;

  const compoundSurnames = [
    ["ערבה", "אליעז"],
    ["גולדשטיין", "אלמוג"]
  ];

  for (const surname of compoundSurnames) {
    const matches = surname.every((part, index) => parts[index] === part);
    if (matches && parts.length > surname.length) {
      return [...parts.slice(surname.length), ...surname];
    }
  }

  // Default original data pattern is: surname first, given name(s) after.
  return [...parts.slice(1), parts[0]];
}

function formatDisplayName(name) {
  return displayNameParts(name).join(" ");
}

function initials(name) {
  return displayNameParts(name).slice(0, 2).map((part) => part[0]).join("") || "✦";
}

function stableHash(value) {
  let hash = 0;
  String(value || "").split("").forEach((char) => {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  });
  return Math.abs(hash);
}

function announce(message) {
  if (!els.announcer) return;
  els.announcer.textContent = "";
  setTimeout(() => { els.announcer.textContent = message; }, 20);
}

function updateUrlSafely(url, stateObject = {}) {
  if (window.location.protocol === "file:") return;
  history.pushState(stateObject, "", url);
}

function getAge(person) {
  const n = Number(person.age);
  return Number.isFinite(n) ? n : null;
}


const CUSTOM_APPEARANCE_ORDER = [
  [
    "ליבשטיין",
    "אופיר"
  ],
  [
    "צדיקביץ",
    "עומר"
  ],
  [
    "קוץ",
    "אביב"
  ],
  [
    "קוץ",
    "ליבנת"
  ],
  [
    "קוץ",
    "רותם"
  ],
  [
    "קוץ",
    "יונתן"
  ],
  [
    "קוץ",
    "יפתח"
  ],
  [
    "זוהר",
    "יניב"
  ],
  [
    "זוהר",
    "יסמין"
  ],
  [
    "זוהר",
    "קשת"
  ],
  [
    "זוהר",
    "תכלת"
  ],
  [
    "ליבשטיין",
    "ניצן"
  ],
  [
    "גולדשטיין",
    "אלמוג",
    "נדב"
  ],
  [
    "גולדשטיין",
    "אלמוג",
    "ים"
  ],
  [
    "אדמוני",
    "מיכל"
  ],
  [
    "אדמוני",
    "גיא"
  ],
  [
    "איתמרי",
    "רם"
  ],
  [
    "איתמרי",
    "לילי"
  ],
  [
    "ברדיצסקי",
    "איתי"
  ],
  [
    "ברדיצסקי",
    "הדר"
  ],
  [
    "אפשטיין",
    "בלהה"
  ],
  [
    "אפשטיין",
    "נטע"
  ],
  [
    "גורן",
    "טובה"
  ],
  [
    "גורן",
    "ארן"
  ],
  [
    "ורטהיים",
    "דורית"
  ],
  [
    "ורטהיים",
    "אביב"
  ],
  [
    "זיו",
    "איתן"
  ],
  [
    "פלג",
    "זיו",
    "תמי"
  ],
  [
    "פלד",
    "גילה"
  ],
  [
    "פלד",
    "יזהר"
  ],
  [
    "פלד",
    "דניאל"
  ],
  [
    "פלש",
    "יגאל"
  ],
  [
    "פלש",
    "תמר"
  ],
  [
    "שוורצמן",
    "דוד"
  ],
  [
    "שוורצמן",
    "אורלי"
  ],
  [
    "עידן",
    "צחי"
  ],
  [
    "עידן",
    "מעיין"
  ],
  [
    "עידן",
    "רועי"
  ],
  [
    "עידן",
    "סמדר"
  ],
  [
    "אליקים",
    "נועם"
  ],
  [
    "ערבה",
    "דקלה"
  ],
  [
    "ערבה",
    "אליעז",
    "תומר"
  ],
  [
    "רביב",
    "ניב"
  ],
  [
    "זיני",
    "ניראל"
  ],
  [
    "אלקבץ",
    "סיון"
  ],
  [
    "חסידים",
    "נאור"
  ],
  [
    "חגבי",
    "זיו"
  ],
  [
    "חגבי",
    "יהונתן"
  ],
  [
    "חגבי",
    "אליצור"
  ],
  [
    "חגבי",
    "יזהר"
  ]
];

function cleanOrderText(value) {
  return normalizeText(value)
    .replace(/ז"?ל|ז״ל/gu, "")
    .replace(/[׳'`״"]/gu, "")
    .replace(/[()\[\].,:;־\-–—]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function customOrderRank(person) {
  const text = cleanOrderText(`${person.name || ""} ${formatDisplayName(person.name || "")}`);
  const index = CUSTOM_APPEARANCE_ORDER.findIndex((tokens) =>
    tokens.every((token) => text.includes(cleanOrderText(token)))
  );
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function sortPeople(a, b) {
  const rankA = customOrderRank(a);
  const rankB = customOrderRank(b);

  if (rankA !== rankB) return rankA - rankB;

  const ageA = getAge(a);
  const ageB = getAge(b);

  if (ageA !== null && ageB !== null && ageA !== ageB) return ageA - ageB;
  if (ageA !== null && ageB === null) return -1;
  if (ageA === null && ageB !== null) return 1;

  return formatDisplayName(a.name).localeCompare(formatDisplayName(b.name), "he");
}

function points() {
  return window.matchMedia("(max-width: 900px) and (orientation: portrait)").matches ? MOBILE_POINTS : DESKTOP_POINTS;
}

function visibleCount() {
  return Math.min(points().length, PAGE_SIZE);
}

const CandleStore = {
  read() {
    try { return JSON.parse(localStorage.getItem(CANDLE_KEY) || "{}"); }
    catch { return {}; }
  },
  save(map) {
    localStorage.setItem(CANDLE_KEY, JSON.stringify(map));
  },
  isLit(id) {
    return Boolean(this.read()[id]);
  },
  light(id) {
    const map = this.read();
    if (!map[id]) {
      map[id] = new Date().toISOString();
      this.save(map);
    }
  },
  count(id) {
    return 12 + (stableHash(id) % 54) + (this.isLit(id) ? 1 : 0);
  }
};


function isFemale(person) {
  if (person.gender === "female") return true;
  if (person.gender === "male") return false;
  const parents = String(person.parents || "");
  const family = String(person.family || "");
  return parents.startsWith("בת") || family.startsWith("הותירה");
}

function familyLabel(person) {
  return isFemale(person) ? "הותירה אחריה" : "הותיר אחריו";
}

function cleanFamilyText(person) {
  const raw = String(person.family || "").trim();
  if (!raw) return "";
  return raw
    .replace(/^הותירה\s+אחריה\s*/u, "")
    .replace(/^הותיר\s+אחריו\s*/u, "")
    .replace(/^הותירה\s*/u, "")
    .replace(/^הותיר\s*/u, "")
    .trim();
}

function isGuardMember(person) {
  const text = `${person.role || ""} ${person.storySummary || ""}`;
  return ["כיתת הכוננות", "כיתת כוננות", "רבש\"ץ", "סגן רבש\"ץ"].some((term) => text.includes(term));
}


function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanPersonKey(value) {
  return stripMemorialSuffix(value)
    .replace(/[״"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstNameCandidates(person) {
  const parts = displayNameParts(person.name);
  if (!parts.length) return [];

  const firstParts = parts.length > 1 ? parts.slice(0, -1) : parts;
  const candidates = [
    firstParts.join(" "),
    firstParts[0],
    parts.join(" "),
  ];

  return [...new Set(candidates.filter(Boolean).map(cleanPersonKey))];
}

function lineMentionsCandidate(line, candidate) {
  const text = cleanPersonKey(line);
  const clean = cleanPersonKey(candidate);
  if (!clean || clean.length < 2) return false;

  const escaped = escapeRegex(clean);
  const boundary = "(^|[\\s,.;:־\\-()])";
  const endBoundary = "($|[\\s,.;:־\\-()])";
  const directPattern = new RegExp(`${boundary}${escaped}${endBoundary}`, "u");

  if (directPattern.test(text)) return true;

  // Hebrew lists often attach ו before the final name: "רותם ויפתח".
  if (!clean.includes(" ")) {
    const withVavPattern = new RegExp(`${boundary}ו${escaped}${endBoundary}`, "u");
    return withVavPattern.test(text);
  }

  return false;
}

function personMentionsOther(person, other) {
  const lines = relativesLines(person).join(" · ");
  if (!lines) return false;
  return firstNameCandidates(other).some((candidate) => lineMentionsCandidate(lines, candidate));
}

function isDirectFamilyBond(a, b) {
  if (!a || !b || a.id === b.id) return false;

  if (a.familyGroupId && b.familyGroupId && a.familyGroupId === b.familyGroupId) return true;

  if (personMentionsOther(a, b) || personMentionsOther(b, a)) return true;

  // A gentle fallback for household groups where the uploaded data used the same family name.
  const aParts = displayNameParts(a.name);
  const bParts = displayNameParts(b.name);
  const aSurname = aParts.length > 1 ? aParts[aParts.length - 1] : "";
  const bSurname = bParts.length > 1 ? bParts[bParts.length - 1] : "";
  const familyText = `${relativesLines(a).join(" ")} ${relativesLines(b).join(" ")}`;

  return Boolean(aSurname && bSurname && aSurname === bSurname && /אח|אחות|אימ|אב|בנם|בתם|בעלה|אשתו|בן זוג|בת זוג/u.test(familyText));
}

function relatedIdsFor(person) {
  const ids = new Set();

  state.people.forEach((other) => {
    if (isDirectFamilyBond(person, other)) ids.add(other.id);
  });

  return ids;
}

function updateFocusClasses() {
  const hasFocus = Boolean(state.focusPersonId);

  els.stage?.classList.toggle("is-focus-mode", hasFocus);
  els.stage?.classList.toggle("is-focus-locked", Boolean(state.focusLocked));

  els.layer.querySelectorAll(".person-node").forEach((node) => {
    const id = node.dataset.personId;
    const focused = hasFocus && id === state.focusPersonId;
    const related = hasFocus && state.focusRelatedIds.has(id);

    node.classList.toggle("is-focused", focused);
    node.classList.toggle("is-related", related);
    node.classList.toggle("is-dimmed", hasFocus && !focused && !related);
  });
}

function focusPerson(person, locked = false) {
  if (!person) return;

  state.focusPersonId = person.id;
  state.focusRelatedIds = relatedIdsFor(person);
  state.focusLocked = locked;

  updateFocusClasses();
}

function clearFocusMode(force = false) {
  if (state.openPersonId && !force) return;

  state.focusPersonId = null;
  state.focusRelatedIds = new Set();
  state.focusLocked = false;

  updateFocusClasses();
}

function getPhotoSources(photo) {
  if (!photo) return { src: "", srcset: "" };
  return {
    src: photo,
    srcset: "",
  };
}

function createPortraitImage(person) {
  const sources = getPhotoSources(person.photo);
  const img = el("img", {
    src: sources.src || "",
    alt: `תמונה של ${formatDisplayName(person.name)}`,
    loading: "lazy",
    decoding: "async",
  });

  if (sources.srcset) img.setAttribute("srcset", sources.srcset);

  // In the no-images package, image files are intentionally omitted.
  // Replace missing images with an in-DOM initials placeholder instead of
  // falling back to a missing SVG, which made Chrome display the full alt text
  // inside the portrait circle and visually overlap the name tags on mobile.
  img.onerror = () => {
    img.onerror = null;
    const fallback = el("span", {
      class: "portrait-placeholder",
      text: initials(person.name),
      "aria-hidden": "true",
    });
    img.replaceWith(fallback);
  };

  return img;
}

function enrichPerson(person, index) {
  return {
    ...person,
    id: person.id || `person-${String(index + 1).padStart(3, "0")}`,
    photo: person.photo || "",
  };
}

function updatePathProgress() {
  if (!els.pathFill) return;
  const total = Math.max(state.filtered.length, 1);
  const progressed = Math.min(total, Math.max(visibleCount(), state.nextIndex));
  const ratio = Math.min(1, Math.max(.10, progressed / total));
  els.pathFill.style.strokeDasharray = "1500";
  els.pathFill.style.strokeDashoffset = String(1500 - ratio * 1500);
}

function applySearch(query) {
  clearFocusMode(true);
  state.query = normalizeText(query);

  const source = !state.query
    ? [...state.people]
    : state.people.filter((person) =>
        [
          person.name,
          formatDisplayName(person.name),
          person.community,
          person.age,
          person.role,
          person.storySummary,
          person.family,
          person.eventPlace,
          person.burialPlace,
        ].some((value) => normalizeText(value).includes(state.query))
      );

  state.filtered = source.sort(sortPeople);
  initializeVisible();
  renderAllVisible({ initial: true });
  startTimer();
}

function initializeVisible() {
  const count = visibleCount();
  state.visible = state.filtered.slice(0, count);
  state.visibleIds = new Set(state.visible.map((person) => person.id));
  state.nextIndex = state.visible.length % (state.filtered.length || 1);
  state.slotCursor = 0;
  state.history = [];
}

function showEmptyState() {
  els.layer.replaceChildren(
    el("div", { class: "empty-state" },
      el("div", {},
        el("h2", { text: "לא נמצאו תוצאות" }),
        el("p", { text: "נסי לחפש שם, יישוב, גיל או פרט מתוך הסיפור." })
      )
    )
  );
}

function renderAllVisible(options = {}) {
  els.layer.replaceChildren();

  if (!state.visible.length) {
    showEmptyState();
    return;
  }

  state.visible.forEach((person, index) => {
    const node = renderPersonNode(person, index);
    node.dataset.slotIndex = String(index);
    els.layer.append(node);

    const delay = options.initial ? index * 100 : 120 + index * 110;
    requestAnimationFrame(() => {
      setTimeout(() => node.classList.add("is-visible"), delay);
    });
  });

  updatePathProgress();
  updateFocusClasses();
  syncStoryFromQuery();
}

function renderPersonNode(person, index) {
  const point = points()[index % points().length];
  const isTop = point.side === "top";
  const scale = point.size || .9;

  const node = el("article", {
    class: `person-node ${isTop ? "is-top" : "is-bottom"}`,
    dataset: { personId: person.id, slotIndex: String(index) },
    style: {
      right: `${point.x}%`,
      left: "auto",
      top: `${point.y}%`,
      "--node-w": `${7.7 * scale}rem`,
      "--photo-w": `${6.25 * scale}rem`,
      "--from-y": isTop ? "1rem" : "-1rem",
      "--to-y": isTop ? "1.1rem" : "-1.1rem",
      "--stem": `${2.15 * scale}rem`,
      "--stem-dir": isTop ? "to bottom" : "to top",
      "--stem-origin": isTop ? "top" : "bottom",
    },
  });

  const button = el("button", {
    class: "person-button",
    type: "button",
    "aria-label": `פתיחת הסיפור של ${formatDisplayName(person.name)}`,
    onPointerEnter: () => focusPerson(person),
    onPointerLeave: () => clearFocusMode(),
    onFocus: () => focusPerson(person),
    onBlur: () => clearFocusMode(),
    onClick: () => {
      focusPerson(person, true);

      // Let the dim-and-illuminate moment register before the story opens.
      window.setTimeout(() => openStory(person), 260);
    },
  });

  button.append(
    el("div", { class: "portrait-frame" },
      person.photo
        ? createPortraitImage(person)
        : el("span", { class: "portrait-placeholder", text: initials(person.name), "aria-hidden": "true" })
    ),
    el("span", { class: "person-name" },
      ...displayNameParts(person.name).map((part) => el("span", { text: part }))
    )
  );

  node.append(button);
  return node;
}

function nextPersonForSequence() {
  if (!state.filtered.length) return null;
  const person = state.filtered[state.nextIndex % state.filtered.length];
  state.nextIndex = (state.nextIndex + 1) % state.filtered.length;
  return person;
}

function replaceOne(direction = 1) {
  if (!state.filtered.length || state.visible.length <= 1) return;

  if (direction < 0 && state.history.length) {
    const last = state.history.pop();
    state.visible[last.slotIndex] = last.previousPerson;
    state.visibleIds.delete(last.nextPerson.id);
    state.visibleIds.add(last.previousPerson.id);
    state.slotCursor = last.slotIndex;
    replaceNode(last.slotIndex, last.previousPerson);
    updatePathProgress();
    return;
  }

  const slotIndex = state.slotCursor % state.visible.length;
  const previousPerson = state.visible[slotIndex];
  let nextPerson = nextPersonForSequence();
  let guard = 0;

  while (nextPerson && state.visibleIds.has(nextPerson.id) && guard < state.filtered.length) {
    nextPerson = nextPersonForSequence();
    guard += 1;
  }

  if (!nextPerson) return;

  state.visible[slotIndex] = nextPerson;
  state.visibleIds.delete(previousPerson.id);
  state.visibleIds.add(nextPerson.id);
  state.history.push({ slotIndex, previousPerson, nextPerson });
  state.slotCursor = (state.slotCursor + 1) % state.visible.length;

  replaceNode(slotIndex, nextPerson);
  updatePathProgress();
}

function replaceNode(slotIndex, person) {
  const oldNode = els.layer.querySelector(`.person-node[data-slot-index="${slotIndex}"]`);
  const newNode = renderPersonNode(person, slotIndex);
  newNode.dataset.slotIndex = String(slotIndex);

  if (!oldNode) {
    els.layer.append(newNode);
    requestAnimationFrame(() => {
      newNode.classList.add("is-visible");
      updateFocusClasses();
    });
    return;
  }

  oldNode.classList.add("is-leaving");
  setTimeout(() => {
    if (oldNode.isConnected) oldNode.replaceWith(newNode);
    requestAnimationFrame(() => {
      newNode.classList.add("is-visible");
      updateFocusClasses();
    });
  }, 1050);
}

function nextStep() {
  replaceOne(1);
}

function prevStep() {
  replaceOne(-1);
}


function relativesLines(person) {
  if (Array.isArray(person.relativesLines)) {
    return person.relativesLines.filter(Boolean);
  }
  if (person.relativesText) {
    return String(person.relativesText)
      .split(/[.;]\s*/u)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}


function storyText(person) {
  const clean = String(person.storySummaryClean || "").trim();
  const original = String(person.storySummary || "").trim();

  if (clean) return clean;
  if (original) return original;
  return "טרם נוסף סיפור מורחב.";
}

function compactRelativesText(person) {
  const lines = relativesLines(person);
  if (!lines.length) return "";
  return lines.join(" · ");
}

function relationshipParts(line) {
  const text = String(line || "").trim();
  const patterns = [
    "נכדתם הבכורה של", "נכדם הבכור של", "נכדתם של", "נכדם של",
    "בנם של", "בתם של", "בנו של", "בתו של", "בנה של", "בתה של",
    "בעלה של", "אשתו של", "בן זוגה של", "בת זוגו של",
    "אביהם של", "אביהן של", "אביה של", "אביו של", "אב ל", "אבא ל",
    "אימם של", "אמן של", "אימה של", "אמו של",
    "אחיהם של", "אחותם של", "אח ל", "אחות ל",
    "נשוי ל", "נשואה ל"
  ];

  const found = patterns.find((pattern) => text.startsWith(pattern));
  if (!found) return { label: "", value: text };

  return {
    label: found,
    value: text.slice(found.length).trim(),
  };
}

function relativesSection(person) {
  const lines = relativesLines(person);
  if (!lines.length) return null;

  return el("section", { class: "relatives-card relatives-card-flow relatives-card-no-title", "aria-label": `פרטי משפחה של ${formatDisplayName(person.name)}` },
    el("div", { class: "relatives-sentence" },
      lines.map((line, index) =>
        el("span", { class: "relatives-segment" },
          el("span", { class: "relatives-segment-text", text: line }),
          index < lines.length - 1 ? el("span", { class: "relatives-dot", text: "•" }) : null
        )
      )
    )
  );
}

function familyGroupSection(person) {
  if (!person.familyGroupId || !person.familyGroupPhoto) return null;

  const members = Array.isArray(person.familyGroupMembers)
    ? person.familyGroupMembers.filter(Boolean)
    : [];

  return el("section", { class: "family-group-card", "aria-label": `תמונת קשר משפחתי: ${person.familyGroupTitle || formatDisplayName(person.name)}` },
    el("div", { class: "family-group-image-wrap" },
      el("img", {
        class: "family-group-image",
        src: person.familyGroupPhoto,
        alt: person.familyGroupTitle || "תמונה משפחתית",
        loading: "lazy",
        decoding: "async",
      })
    ),
    el("div", { class: "family-group-copy" },
      el("span", { class: "family-group-kicker", text: person.familyGroupRelation || "קשר משפחתי" }),
      el("h3", { text: person.familyGroupTitle || "נרצחו יחד" }),
      person.familyGroupNote ? el("p", { text: person.familyGroupNote }) : null,
      members.length ? el("div", { class: "family-group-members" },
        members.map((member) => el("span", { text: member }))
      ) : null
    )
  );
}

function storyDetails(person) {
  const items = [
    ["יישוב", person.community || "לא צוין"],
    ["תאריך לידה", person.birthDate],
    ["מקום קבורה", person.burialPlace],
  ].filter(([, value]) => Boolean(value));

  if (!items.length) return null;

  return el("div", { class: "details-grid" },
    items.map(([label, value]) =>
      el("div", { class: "detail" },
        el("strong", { text: label }),
        el("span", { text: value })
      )
    )
  );
}

function openStory(person) {
  focusPerson(person, true);
  state.openPersonId = person.id;

  const url = new URL(window.location.href);
  url.searchParams.set("id", person.id);
  updateUrlSafely(url, { id: person.id });

  renderStory(person);
  announce(`${formatDisplayName(person.name)}. ${person.storySummary || "סיפור אישי נפתח."}`);
}

function closeStory() {
  state.openPersonId = null;
  els.storyRoot.replaceChildren();
  clearFocusMode(true);

  const url = new URL(window.location.href);
  url.searchParams.delete("id");
  updateUrlSafely(url, {});
}

function renderStory(person) {
  const lit = CandleStore.isLit(person.id);

  const overlay = el("div", {
    class: "story-overlay",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "story-title",
  });

  const closeBtn = el("button", {
    class: "close-story",
    type: "button",
    "aria-label": "סגירת סיפור",
    onClick: closeStory,
  }, "×");

  const candleBtn = el("button", {
    type: "button",
    onClick: () => {
      CandleStore.light(person.id);
      renderStory(person);
    },
  }, lit ? `נר דולק · ${CandleStore.count(person.id)}` : `הדלקת נר · ${CandleStore.count(person.id)}`);

  const panel = el("article", { class: "story-panel", tabindex: "-1" },
    closeBtn,
    el("div", { class: "story-grid-head" },
      el("div", { class: "story-photo" },
        person.photo
          ? createPortraitImage(person)
          : el("span", { class: "portrait-placeholder", text: initials(person.name), "aria-hidden": "true" })
      ),
      el("div", { class: "story-copy" },
        el("h2", { id: "story-title", text: formatDisplayName(person.name) }),
        el("div", { class: "story-meta" },
          el("span", { text: person.community || "יישוב לא צוין" }),
          getAge(person) !== null ? el("span", { text: `גיל ${person.age}` }) : null,
          isGuardMember(person) ? el("span", { text: "כיתת כוננות" }) : null
        ),
        el("p", { text: storyText(person) }),
        el("div", { class: "story-actions" }, candleBtn)
      )
    ),
    familyGroupSection(person),
    relativesSection(person),
    storyDetails(person)
  );

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeStory();
  });

  overlay.append(panel);
  els.storyRoot.replaceChildren(overlay);
  panel.focus({ preventScroll: true });
}

function syncStoryFromQuery() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return;

  const person = state.people.find((item) => item.id === id);
  if (person && state.openPersonId !== id) {
    renderStory(person);
  }
}

function startTimer() {
  stopTimer();
  if (!state.paused) {
    state.timer = setInterval(nextStep, ROTATE_MS);
  }
}

function stopTimer() {
  clearInterval(state.timer);
  state.timer = null;
}

async function loadData() {
  if (Array.isArray(window.MEMORIAL_DATA) && window.MEMORIAL_DATA.length) {
    return window.MEMORIAL_DATA;
  }

  try {
    const response = await fetch("data.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch {
    return [];
  }
}

function initEvents() {
  els.search.addEventListener("input", debounce((event) => {
    applySearch(event.target.value);
  }, 250));

  els.next.addEventListener("click", () => {
    nextStep();
    startTimer();
  });

  els.prev.addEventListener("click", () => {
    prevStep();
    startTimer();
  });

  els.pause.addEventListener("click", () => {
    state.paused = !state.paused;
    els.pause.setAttribute("aria-pressed", String(state.paused));
    els.pause.innerHTML = state.paused
      ? '<span class="icon" aria-hidden="true">▶</span>הפעלה'
      : '<span class="icon" aria-hidden="true">Ⅱ</span>השהיה';

    if (state.paused) stopTimer();
    else startTimer();
  });

  window.addEventListener("resize", debounce(() => {
    initializeVisible();
    renderAllVisible({ initial: true });
  }, 180));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.openPersonId) closeStory();
    if (event.key === "ArrowLeft" && !state.openPersonId) nextStep();
    if (event.key === "ArrowRight" && !state.openPersonId) prevStep();
  });

  window.addEventListener("popstate", syncStoryFromQuery);
}

async function init() {
  initEvents();

  const data = await loadData();
  state.people = Array.isArray(data)
    ? data.map(enrichPerson).filter((person) => person.name)
    : [];

  applySearch("");
}

init();
