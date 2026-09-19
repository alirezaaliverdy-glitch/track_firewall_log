import { mkdirSync, writeFileSync } from "node:fs";

const {
  GITHUB_REF = "",
  GITHUB_REF_NAME = "",
  GITHUB_REF_TYPE = "",
  GITHUB_RUN_ATTEMPT = "",
  GITHUB_RUN_ID = "",
  GITHUB_SHA = "",
} = process.env;

mkdirSync("release", { recursive: true });

const version = GITHUB_REF_TYPE === "tag" ? GITHUB_REF_NAME : `snapshot-${GITHUB_SHA.slice(0, 12)}`;

const metadata = {
  name: "track-firewall-log",
  version,
  commit: GITHUB_SHA,
  ref: GITHUB_REF,
  refName: GITHUB_REF_NAME,
  runId: GITHUB_RUN_ID,
  runAttempt: GITHUB_RUN_ATTEMPT,
  createdAtUtc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  artifacts: ["frontend-dist.tar.gz", "backend-dist.tar.gz"],
  rollback: {
    strategy: "redeploy previous artifact pair by commit and checksum",
    requiresDatabaseRollback: false,
  },
};

writeFileSync("release/release-metadata.json", `${JSON.stringify(metadata, null, 2)}\n`);
