/* =====================================================================
   admin.js – schlanke Admin-Seite: Rollen vergeben (max. 2 Admins, 3 Mods)
   Die Limits erzwingt die Datenbank (Trigger enforce_role_limits);
   hier wird nur die Fehlermeldung sauber angezeigt.
   ===================================================================== */

function roleLabel(role) {
  return { admin: "Admin", moderator: "Moderator" }[role] || role;
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
