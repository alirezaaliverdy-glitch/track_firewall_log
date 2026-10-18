import test from "node:test";
import assert from "node:assert/strict";
import { findMutationPermission } from "../src/security/authorization.js";
import { hasPermission } from "../src/security/permissions.js";
import { FILE_LIMIT, GLOBAL_FILE_LIMIT, WORKSPACE_FILE_LIMIT, validateCommunityFile, messageHash, memberScope } from "../src/services/community-collaboration.service.js";

test("collaboration upload accepts only bounded business formats with matching bytes", () => {
  assert.equal(validateCommunityFile("یادداشت.txt", Buffer.from("متن آزمایشی")).mimeType, "text/plain");
  assert.equal(validateCommunityFile("export.csv", Buffer.from("name,status\nfixture,ok")).mimeType, "text/plain");
  assert.equal(validateCommunityFile("sample.pdf", Buffer.from("%PDF-1.7\nfixture\n%%EOF")).mimeType, "application/pdf");
  for (const name of ["active.svg", "page.html", "payload.exe", "archive.zip", "macro.docm"])
    assert.throws(() => validateCommunityFile(name, Buffer.from("fixture")), /COMMUNITY_FILE_TYPE/);
  assert.throws(() => validateCommunityFile("fake.png", Buffer.from("fixture")), /COMMUNITY_FILE_TYPE/);
  assert.throws(() => validateCommunityFile("binary.log", Buffer.from([65, 0, 66])), /COMMUNITY_FILE_TYPE/);
  assert.throws(() => validateCommunityFile("empty.txt", Buffer.alloc(0)), /COMMUNITY_FILE_SIZE/);
  assert.throws(() => validateCommunityFile("large.txt", Buffer.alloc(FILE_LIMIT + 1, 65)), /COMMUNITY_FILE_SIZE/);
  assert.ok(WORKSPACE_FILE_LIMIT < GLOBAL_FILE_LIMIT);
});
test("collaboration filenames cannot introduce paths, headers, hidden executables or bidi spoofing", () => {
  for (const name of ["../note.txt", "C:\\note.txt", "name:stream.txt", "file\r\nheader.txt", "a\u202etxt.exe", ".env", "a..txt", " leading.txt"])
    assert.throws(() => validateCommunityFile(name, Buffer.from("fixture")), /COMMUNITY_FILE_NAME/);
});
test("message retry identity includes exact attachment bytes, name and reply target", () => {
  const a = validateCommunityFile("note.txt", Buffer.from("first")), b = validateCommunityFile("note.txt", Buffer.from("second"));
  assert.equal(messageHash("text", "parent", [a]), messageHash("text", "parent", [a]));
  assert.notEqual(messageHash("text", "parent", [a]), messageHash("text", "parent", [b]));
  assert.notEqual(messageHash("text", "parent", [a]), messageHash("text", "different", [a]));
});
test("viewer collaboration permissions are narrow and workspace membership excludes independent admins", () => {
  for (const [method, path] of [["POST", "/api/community/threads/t/messages/files"], ["PATCH", "/api/community/threads/t/messages/m"],
    ["DELETE", "/api/community/threads/t/messages/m"], ["POST", "/api/community/tasks"], ["PATCH", "/api/community/tasks/t"]]) {
    const permission = findMutationPermission(method, path);
    assert.equal(permission, "community.participate"); assert.equal(hasPermission("viewer", permission!), true);
  }
  const devicePermission = findMutationPermission("POST", "/api/devices");
  assert.ok(devicePermission); assert.equal(hasPermission("viewer", devicePermission), false);
  assert.deepEqual(memberScope({ id: "viewer", username: "fixture", displayName: "Fixture", role: "viewer", allowedSections: [], scopeOwnerId: "owner" }),
    { isActive: true, OR: [{ id: "owner" }, { workspaceOwnerId: "owner", role: { not: "admin" } }] });
});
