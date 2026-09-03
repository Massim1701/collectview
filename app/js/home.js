/* home.js – Dashboard: Kennzahlen, zuletzt hinzugefügt, Format-Übersicht */

renderBottomNav(document.getElementById("bottomnav"), "home");

const recentEl = document.getElementById("recent");
const breakdownEl = document.getElementById("breakdown");
const formatSection = document.getElementById("formate-section");

const RECENT_LIMIT = 8;

function renderStats(stats) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    el.textContent = value;
    el.classList.remove("is-loading");
  };
  set("stat-total", stats.total);
  set("stat-artists", stats.artists);
}

function renderRecent(items) {
  if (items.length === 0) {
    recentEl.innerHTML = "";
    recentEl.insertAdjacentHTML(
      "afterend",
      `<div id="recent-empty">${emptyState({
        iconName: "scan",
        title: "Noch nichts in der Sammlung",
        text: "Scanne den Barcode deiner ersten Platte oder CD – der Rest kommt von Discogs.",
        action: { href: "scanner.html", label: "Jetzt scannen" },
      })}</div>`,
    );
    return;
  }

  recentEl.innerHTML = items
    .slice(0, RECENT_LIMIT)
    .map((item) => `<div class="rail-item">${coverTileMarkup(item)}</div>`)
    .join("");
}

function renderBreakdown(items) {
  const rows = formatBreakdown(items);
  if (rows.length === 0) return;

  const max = Math.max(...rows.map((r) => r.count));
  formatSection.hidden = false;
  breakdownEl.innerHTML = rows
    .map(
      (row) => `
      <a class="breakdown-row" href="collection.html?format=${row.key}">
        <span>${escapeHtml(row.label)}</span>
        <span class="bar"><span style="width:${Math.round((row.count / max) * 100)}%"></span></span>
        <span class="num">${row.count}</span>
      </a>`,
    )
    .join("");
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  wireAccountMenu(document.getElementById("account-menu-btn"), user, { openNow: location.hash === "#konto" });
  initFeedback();
  renderInboxBadge(document.getElementById("inbox-btn"));

  recentEl.innerHTML = `<div class="rail-item">${skeletonGrid(1)}</div>`.repeat(3);

  try {
    const items = await fetchCollection();
    renderStats(computeStats(items));
    renderRecent(items);
    renderBreakdown(items);
  } catch (e) {
    recentEl.innerHTML = "";
    recentEl.insertAdjacentHTML("afterend", errorState(e.message));
    ["stat-total", "stat-artists"].forEach((id) => {
      document.getElementById(id).textContent = "–";
    });
  }
}

init();
