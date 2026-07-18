import { openDB } from "idb";

const DATABASE_NAME = "max-vault-cache";
const DATABASE_VERSION = 2;

let databasePromise;

function database() {
  if (!databasePromise) {
    databasePromise = openDB(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("repositories")) {
          db.createObjectStore("repositories", { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains("snapshots")) {
          const snapshots = db.createObjectStore("snapshots", { keyPath: "key" });
          snapshots.createIndex("byRepo", "repoId");
        }

        if (!db.objectStoreNames.contains("files")) {
          const files = db.createObjectStore("files", { keyPath: "key" });
          files.createIndex("bySnapshot", ["repoId", "commitSha"]);
        }

        if (!db.objectStoreNames.contains("fileHistories")) {
          const histories = db.createObjectStore("fileHistories", { keyPath: "key" });
          histories.createIndex("bySnapshot", ["repoId", "headSha"]);
        }
      },
    });
  }
  return databasePromise;
}

function sourceExclusions(source) {
  return [...(source?.exclude || [])].map(String).sort();
}

function repositoryMatchesSource(repository, source) {
  if (!source || typeof source === "string") return true;
  return repository.owner === source.owner
    && repository.repo === source.repo
    && repository.ref === (source.ref || "main")
    && repository.root === (source.root || "")
    && JSON.stringify(repository.exclude || []) === JSON.stringify(sourceExclusions(source));
}

export async function readActiveSnapshot(source) {
  const repoId = typeof source === "string" ? source : source.id;
  const db = await database();
  const repository = await db.get("repositories", repoId);
  if (!repository?.activeCommit || !repositoryMatchesSource(repository, source)) return null;

  const key = `${repoId}@${repository.activeCommit}`;
  const snapshot = await db.get("snapshots", key);
  if (!snapshot) return null;

  const files = await db.getAllFromIndex("files", "bySnapshot", [repoId, repository.activeCommit]);
  return {
    ...snapshot,
    files: files.map(({ key: _key, ...file }) => file),
    repository,
  };
}

function historyKey(repoId, repoPath, headSha, pageKey) {
  return `${repoId}@${headSha}:${encodeURIComponent(repoPath)}:${encodeURIComponent(String(pageKey))}`;
}

export async function readFileHistory(repoId, repoPath, headSha, pageKey = 1) {
  const db = await database();
  const record = await db.get("fileHistories", historyKey(repoId, repoPath, headSha, pageKey));
  return record?.history || null;
}

export async function saveFileHistory(repoId, repoPath, headSha, pageKey, history) {
  const db = await database();
  await db.put("fileHistories", {
    key: historyKey(repoId, repoPath, headSha, pageKey),
    repoId,
    repoPath,
    headSha,
    pageKey: String(pageKey),
    savedAt: Date.now(),
    history,
  });
  return history;
}

export async function saveSnapshot(source, snapshot, repositoryMetadata = {}) {
  const db = await database();
  const { files, ...snapshotRecord } = snapshot;
  const tx = db.transaction(["repositories", "snapshots", "files"], "readwrite");

  await tx.objectStore("snapshots").put(snapshotRecord);
  const fileStore = tx.objectStore("files");
  const existingFiles = fileStore.index("bySnapshot");
  let existingCursor = await existingFiles.openKeyCursor([source.id, snapshot.commitSha]);
  while (existingCursor) {
    await fileStore.delete(existingCursor.primaryKey);
    existingCursor = await existingCursor.continue();
  }
  for (const file of files) {
    await fileStore.put({
      ...file,
      key: `${source.id}@${snapshot.commitSha}:${file.path}`,
      repoId: source.id,
      commitSha: snapshot.commitSha,
    });
  }

  const repository = {
    id: source.id,
    owner: source.owner,
    repo: source.repo,
    ref: source.ref || "main",
    root: source.root || "",
    exclude: sourceExclusions(source),
    activeCommit: snapshot.commitSha,
    checkedAt: Date.now(),
    ...repositoryMetadata,
  };
  await tx.objectStore("repositories").put(repository);
  await tx.done;

  cleanupOlderSnapshots(source.id, snapshot.commitSha).catch(() => {});
  return { ...snapshot, repository };
}

export async function markRepositoryChecked(source, metadata = {}) {
  const db = await database();
  const previous = await db.get("repositories", source.id);
  const repository = {
    ...previous,
    id: source.id,
    owner: source.owner,
    repo: source.repo,
    ref: source.ref || "main",
    root: source.root || "",
    exclude: sourceExclusions(source),
    checkedAt: Date.now(),
    ...metadata,
  };
  await db.put("repositories", repository);
  return repository;
}

async function cleanupOlderSnapshots(repoId, activeCommit) {
  const db = await database();
  const snapshots = await db.getAllFromIndex("snapshots", "byRepo", repoId);
  for (const snapshot of snapshots) {
    if (snapshot.commitSha === activeCommit) continue;
    const tx = db.transaction(["snapshots", "files", "fileHistories"], "readwrite");
    const index = tx.objectStore("files").index("bySnapshot");
    let cursor = await index.openKeyCursor([repoId, snapshot.commitSha]);
    while (cursor) {
      await tx.objectStore("files").delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }
    const histories = tx.objectStore("fileHistories").index("bySnapshot");
    let historyCursor = await histories.openKeyCursor([repoId, snapshot.commitSha]);
    while (historyCursor) {
      await tx.objectStore("fileHistories").delete(historyCursor.primaryKey);
      historyCursor = await historyCursor.continue();
    }
    await tx.objectStore("snapshots").delete(snapshot.key);
    await tx.done;
  }
}

export async function clearVaultCache(repoId) {
  const db = await database();
  const repository = await db.get("repositories", repoId);
  if (!repository) return;
  await cleanupOlderSnapshots(repoId, "__none__");
  await db.delete("repositories", repoId);
}
