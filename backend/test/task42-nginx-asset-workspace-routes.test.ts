import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nginx = readFileSync(new URL("../../nginx.firewall-web.conf", import.meta.url), "utf8");

test("extensionless asset workspace paths are handled as SPA routes", () => {
  assert.match(nginx, /location ~ \^\/firewall\/assets/);
  assert.match(nginx, /try_files \/__asset_workspace_spa_route__ \/firewall\/index\.html;/);
});

test("fingerprinted Vite assets retain static handling without suppressing route regexes", () => {
  assert.match(nginx, /location \/firewall\/assets\/ \{/);
  assert.doesNotMatch(nginx, /location \^~ \/firewall\/assets\/ \{/);
  assert.match(nginx, /alias \/usr\/share\/nginx\/html\/assets\/;/);
});
