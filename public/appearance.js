/* Runs before styles and React to avoid a dark flash for a saved light theme. */
(function () {
  var theme = "dark";
  try { if (localStorage.getItem("eosnet.appearance") === "light") theme = "light"; } catch (_) {}
  var root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "light" ? "#f8fafc" : "#07111a";
})();
