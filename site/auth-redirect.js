"use strict";
// O callback OAuth ja esta configurado no Worker para retornar a URL raiz.
// A pagina de consulta nao precisa processar tokens nem exigir login.
(() => {
  const hash = location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const ticket = params.get("ticket");
  const loginError = params.get("login_error");
  if (!ticket && !loginError) return;
  if (ticket && !/^[A-Za-z0-9_-]{40,200}$/.test(ticket)) return;
  if (loginError && !/^[a-z_]{1,60}$/.test(loginError)) return;
  const destination = new URL("./desenvolvedores/", location.href);
  destination.hash = ticket ? "ticket=" + encodeURIComponent(ticket) : "login_error=" + encodeURIComponent(loginError);
  history.replaceState(null, "", location.pathname + location.search);
  location.replace(destination.href);
})();
