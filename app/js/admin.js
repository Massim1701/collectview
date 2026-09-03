/* =====================================================================
   admin.js – schlanke Admin-Seite: Rollen vergeben (max. 2 Admins, 3 Mods)
   Die Limits erzwingt die Datenbank (Trigger enforce_role_limits);
   hier wird nur die Fehlermeldung sauber angezeigt.
   ===================================================================== */

function roleLabel(role) {
  return { admin: "Admin", moderator: "Moderator" }[role] || role;
}

/** Kacheln mit Nutzerzahlen oben auf der Admin-Seite. */
async function renderAdminStats(container) {
  container.innerHTML = `<div class="muted">Lade …</div>`;
  try {
    const s = await fetchAdminStats();
    container.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:12px; margin-bottom:14px;">
        <div>
          <div style="font-size:24px; font-weight:800;">${s.gesamt}</div>
          <div class="muted" style="font-size:12.5px;">Registrierte Nutzer</div>
        </div>
        <div>
          <div style="font-size:24px; font-weight:800; color:var(--accent-text);">${s.aktiv}</div>
          <div class="muted" style="font-size:12.5px;">Aktive Pro-Abos</div>
        </div>
        <div>
          <div style="font-size:24px; font-weight:800;">${s.neuDieseWoche}</div>
          <div class="muted" style="font-size:12.5px;">Neu diese Woche</div>
        </div>
      </div>
      <div class="muted" style="font-size:12.5px;">
        Abos nach Kanal: ${s.nachKanal.website} Website &middot; ${s.nachKanal.apple} App Store &middot; ${s.nachKanal.google} Play Store
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="err">${escapeHtml(e.message)}</div>`;
  }
}

/** "Wer ist online" -- nur für Admin/Mod, die staff_presence-View filtert selbst. */
async function renderOnlineList(container) {
  container.innerHTML = `<div class="muted">Lade …</div>`;
  try {
    const rows = await fetchOnlinePresence();
    const online = rows.filter((r) => r.online);
    container.innerHTML = online.length
      ? online.map((r) => `
          <div class="list-card list-card-plain" style="cursor:default;">
            <div style="min-width:0;">
              <div class="list-card-title">${escapeHtml(r.display_name)}</div>
              <div class="list-card-sub">${roleLabel(r.role) === r.role ? "Nutzer" : roleLabel(r.role)} &middot; zuletzt ${new Date(r.last_seen_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          </div>`).join("")
      : `<div class="muted">Gerade niemand online.</div>`;
  } catch (e) {
    container.innerHTML = `<div class="err">${escapeHtml(e.message)}</div>`;
  }
}

/** Neueste registrierte Nutzer -- auch ohne aktuellen Online-Status. */
async function renderRecentUsers(container) {
  container.innerHTML = `<div class="muted">Lade …</div>`;
  try {
    const rows = await fetchRecentUsers(20);
    container.innerHTML = rows.length
      ? rows.map((p) => `
          <div class="list-card list-card-plain" style="cursor:default;">
            <div style="min-width:0;">
              <div class="list-card-title">${escapeHtml(p.display_name || "(kein Benutzername)")}</div>
              <div class="list-card-sub">${new Date(p.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}${p.subscription_status === "active" ? " &middot; Plus" : ""}${p.role !== "user" ? " &middot; " + roleLabel(p.role) : ""}</div>
            </div>
          </div>`).join("")
      : `<div class="muted">Noch keine Nutzer.</div>`;
  } catch (e) {
    container.innerHTML = `<div class="err">${escapeHtml(e.message)}</div>`;
  }
}

async function renderStaffList(container) {
  container.innerHTML = `<div class="muted">Lade …</div>`;
  try {
    const staff = await fetchStaffList();
    container.innerHTML = staff.length
      ? staff.map((p) => `
          <div class="list-card list-card-plain" style="cursor:default;">
            <div style="min-width:0;">
              <div class="list-card-title">${escapeHtml(p.display_name || "(kein Benutzername)")}</div>
              <div class="list-card-sub">${roleLabel(p.role)}</div>
            </div>
            <button type="button" class="btn-secondary small" data-revoke="${escapeHtml(p.id)}">Auf Nutzer setzen</button>
          </div>`).join("")
      : `<div class="muted">Noch keine Moderatoren oder weiteren Admins.</div>`;

    container.querySelectorAll("[data-revoke]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Rolle wirklich auf 'Nutzer' zurücksetzen?")) return;
        btn.disabled = true;
        try {
          await setUserRole(btn.getAttribute("data-revoke"), "user");
          renderStaffList(container);
        } catch (e) {
          alert(e.message);
          btn.disabled = false;
        }
      });
    });
  } catch (e) {
    container.innerHTML = `<div class="err">${escapeHtml(e.message)}</div>`;
  }
}

function wireAdminForm(formEl, resultEl, staffContainer) {
  formEl.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    resultEl.textContent = "";
    resultEl.className = "muted";

    const name = formEl.querySelector("#admin-username").value.trim();
    const role = formEl.querySelector("#admin-role").value;
    if (!name) return;

    try {
      const user = await findUserByUsername(name);
      if (!user) {
        resultEl.textContent = "Kein Nutzer mit diesem Benutzernamen gefunden.";
        resultEl.className = "err";
        return;
      }
      await setUserRole(user.id, role);
      resultEl.textContent = `${user.display_name} ist jetzt ${roleLabel(role) === role && role === "user" ? "Nutzer" : roleLabel(role)}.`;
      resultEl.className = "muted";
      formEl.reset();
      renderStaffList(staffContainer);
    } catch (e) {
      resultEl.textContent = e.message;
      resultEl.className = "err";
    }
  });
}
