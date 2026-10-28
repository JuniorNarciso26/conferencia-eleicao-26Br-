"use strict";
(() => {
  const api = (window.CONF_CONFIG && window.CONF_CONFIG.apiBaseUrl || "").replace(/\/+$/, "");
  const $ = (selector) => document.querySelector(selector);
  const status = $("#auth-status");
  const apiStatus = $("#api-status");
  const loginButton = $("#login-button");
  const logoutButton = $("#logout-button");
  const KEY = "conferencia_eleitoral_token";

  function setStatus(message) { status.textContent = message; }
  function showLoggedOut() {
    loginButton.hidden = false;
    logoutButton.hidden = true;
  }
  function showLoggedIn(user) {
    setStatus("Conectado como @" + user.login + ".");
    loginButton.hidden = true;
    logoutButton.hidden = false;
  }
  async function fetchAPI(path, options = {}) {
    const response = await fetch(api + path, { cache: "no-store", ...options });
    let result = {};
    try { result = await response.json(); } catch { /* Erro de resposta. */ }
    if (!response.ok) throw new Error(result.code || "HTTP_" + response.status);
    return result;
  }
  async function checkHealth() {
    if (!api) {
      apiStatus.textContent = "API não configurada";
      apiStatus.className = "status error";
      return;
    }
    try {
      const result = await fetchAPI("/api/health");
      if (result.ok && result.github_login === "IMPLEMENTADO") {
        apiStatus.textContent = "Login disponível";
        apiStatus.className = "status ok";
      } else {
        apiStatus.textContent = "Configuração pendente";
        apiStatus.className = "status error";
      }
    } catch {
      apiStatus.textContent = "API indisponível";
      apiStatus.className = "status error";
    }
  }
  async function showProfile(token) {
    const result = await fetchAPI("/api/me", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!result.user || typeof result.user.login !== "string") throw new Error("PERFIL_INVALIDO");
    showLoggedIn(result.user);
  }
  async function init() {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const ticket = fragment.get("ticket");
    const loginError = fragment.get("login_error");
    if (ticket || loginError) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    await checkHealth();
    if (!api) { setStatus("O login será habilitado quando a API for publicada."); return; }
    loginButton.hidden = false;
    if (loginError) {
      sessionStorage.removeItem(KEY);
      setStatus("Não foi possível entrar no GitHub (" + loginError + "). Tente novamente.");
      return;
    }
    if (ticket) {
      setStatus("Concluindo autenticação GitHub...");
      try {
        const response = await fetchAPI("/api/auth/ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket })
        });
        sessionStorage.setItem(KEY, response.token);
        await showProfile(response.token);
      } catch {
        sessionStorage.removeItem(KEY);
        setStatus("Não foi possível concluir a autenticação. Faça login novamente.");
        showLoggedOut();
      }
      return;
    }
    const token = sessionStorage.getItem(KEY);
    if (!token) { setStatus("Entre com sua conta GitHub para colaborar."); return; }
    try { await showProfile(token); }
    catch {
      sessionStorage.removeItem(KEY);
      showLoggedOut();
      setStatus("Sua sessão expirou. Entre novamente.");
    }
  }
  loginButton.addEventListener("click", () => {
    if (!api) return;
    window.location.assign(api + "/api/auth/github");
  });
  logoutButton.addEventListener("click", async () => {
    const token = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    showLoggedOut();
    setStatus("Sessão encerrada neste navegador.");
    if (token) {
      try {
        await fetchAPI("/api/logout", {
          method: "POST", headers: { Authorization: "Bearer " + token }
        });
      } catch { setStatus("Sessão local encerrada. Não foi possível confirmar a saída no servidor."); }
    }
  });
  init().catch(() => {
    showLoggedOut();
    setStatus("Falha ao iniciar autenticação. Atualize a página.");
  });
})();
