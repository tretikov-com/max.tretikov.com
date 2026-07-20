import { openDB } from "idb";

const DATABASE_NAME = "max-vault-cache";
const DATABASE_VERSION = 2;
const MAX_SNAPSHOTS_PER_REPOSITORY = 5;

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

function sourceIdentity(source) {
  return {
    owner: source?.owner || "",
    repo: source?.repo || "",
    ref: source?.ref || "main",
    root: source?.root || "",
    exclude: sourceExclusions(source),
  };
}

function identitiesMatch(left, right) {
  return left?.owner === right?.owner
    && left?.repo === right?.repo
    && left?.ref === right?.ref
    && left?.root === right?.root
    && JSON.stringify(left?.exclude || []) === JSON.stringify(right?.exclude || []);
}

function repositoryMatchesSource(repository, source) {
  if (!source || typeof source === "string") return true;
  return identitiesMatch(repository, sourceIdentity(source));
}

function snapshotMatchesSource(snapshot, repository, source) {
  if (!source || typeof source === "string") return true;
  if (snapshot?.sourceIdentity) {
    return identitiesMatch(snapshot.sourceIdentity, sourceIdentity(source));
  }
  return Boolean(repository && repositoryMatchesSource(repository, source));
}

async function hydrateSnapshot(db, source, commitSha, repository = null) {
  const repoId = typeof source === "string" ? source : source.id;
  const snapshot = await db.get("snapshots", `${repoId}@${commitSha}`);
  if (!snapshot || !snapshotMatchesSource(snapshot, repository, source)) return null;

  const files = await db.getAllFromIndex("files", "bySnapshot", [repoId, commitSha]);
  const lastAccessedAt = Date.now();
  db.put("snapshots", { ...snapshot, lastAccessedAt }).catch(() => {});
  return {
    ...snapshot,
    lastAccessedAt,
    files: files.map(({ key: _key, ...file }) => file),
    repository: repository && repositoryMatchesSource(repository, source) ? repository : null,
  };
}

export async function readActiveSnapshot(source) {
  const repoId = typeof source === "string" ? source : source.id;
  const db = await database();
  const repository = await db.get("repositories", repoId);
  if (!repository?.activeCommit || !repositoryMatchesSource(repository, source)) return null;
  return hydrateSnapshot(db, source, repository.activeCommit, repository);
}

export async function readSnapshot(source, commitSha) {
  const repoId = typeof source === "string" ? source : source?.id;
  const canonicalSha = String(commitSha || "").trim();
  if (!repoId || !canonicalSha) return null;

  const db = await database();
  const repository = await db.get("repositories", repoId);
  return hydrateSnapshot(db, source, canonicalSha, repository);
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

async function replaceSnapshotFiles(store, source, snapshot) {
  const existingFiles = store.index("bySnapshot");
  let existingCursor = await existingFiles.openKeyCursor([source.id, snapshot.commitSha]);
  while (existingCursor) {
    await store.delete(existingCursor.primaryKey);
    existingCursor = await existingCursor.continue();
  }
  for (const file of snapshot.files) {
    await store.put({
      ...file,
      key: `${source.id}@${snapshot.commitSha}:${file.path}`,
      repoId: source.id,
      commitSha: snapshot.commitSha,
    });
  }
}

function snapshotRecord(source, snapshot) {
  const { files: _files, repository: _repository, ...record } = snapshot;
  return {
    ...record,
    key: `${source.id}@${snapshot.commitSha}`,
    repoId: source.id,
    sourceIdentity: sourceIdentity(source),
    lastAccessedAt: Date.now(),
  };
}

export async function saveSnapshot(source, snapshot, repositoryMetadata = {}) {
  const db = await database();
  const previousRepository = await db.get("repositories", source.id);
  const tx = db.transaction(["repositories", "snapshots", "files"], "readwrite");

  await tx.objectStore("snapshots").put(snapshotRecord(source, snapshot));
  const fileStore = tx.objectStore("files");
  await replaceSnapshotFiles(fileStore, source, snapshot);

  const repository = {
    ...(repositoryMatchesSource(previousRepository, source) ? previousRepository : {}),
    id: source.id,
    owner: source.owner,
    repo: source.repo,
    ref: source.ref || "main",
    root: source.root || "",
    exclude: sourceExclusions(source),
    checkedAt: Date.now(),
    ...repositoryMetadata,
    activeCommit: snapshot.commitSha,
  };
  await tx.objectStore("repositories").put(repository);
  await tx.done;

  pruneSnapshots(source.id, [snapshot.commitSha]).catch(() => {});
  return { ...snapshot, repository };
}

export async function saveHistoricalSnapshot(source, snapshot) {
  const db = await database();
  const repository = await db.get("repositories", source.id);
  if (
    repository?.activeCommit === snapshot.commitSha
    && !repositoryMatchesSource(repository, source)
  ) {
    // A reused source id must never replace a different repository's active snapshot record.
    return { ...snapshot, repository: null };
  }

  const tx = db.transaction(["snapshots", "files"], "readwrite");
  await tx.objectStore("snapshots").put(snapshotRecord(source, snapshot));
  await replaceSnapshotFiles(tx.objectStore("files"), source, snapshot);
  await tx.done;

  pruneSnapshots(source.id, [snapshot.commitSha]).catch(() => {});
  return {
    ...snapshot,
    repository: repositoryMatchesSource(repository, source) ? repository : null,
  };
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

async function deleteSnapshot(db, snapshot) {
  const repoId = snapshot.repoId;
  const tx = db.transaction(["snapshots", "files", "fileHistories"], "readwrite");
  const fileStore = tx.objectStore("files");
  const index = fileStore.index("bySnapshot");
  let cursor = await index.openKeyCursor([repoId, snapshot.commitSha]);
  while (cursor) {
    await fileStore.delete(cursor.primaryKey);
    cursor = await cursor.continue();
  }
  const historyStore = tx.objectStore("fileHistories");
  const histories = historyStore.index("bySnapshot");
  let historyCursor = await histories.openKeyCursor([repoId, snapshot.commitSha]);
  while (historyCursor) {
    await historyStore.delete(historyCursor.primaryKey);
    historyCursor = await historyCursor.continue();
  }
  await tx.objectStore("snapshots").delete(snapshot.key);
  await tx.done;
}

async function pruneSnapshots(repoId, protectedCommits = []) {
  const db = await database();
  const repository = await db.get("repositories", repoId);
  const snapshots = await db.getAllFromIndex("snapshots", "byRepo", repoId);
  const keep = new Set([
    repository?.activeCommit,
    ...protectedCommits,
  ].filter(Boolean));
  snapshots
    .sort((left, right) => (
      (right.lastAccessedAt || right.createdAt || 0) - (left.lastAccessedAt || left.createdAt || 0)
    ))
    .forEach((snapshot) => {
      if (keep.size < MAX_SNAPSHOTS_PER_REPOSITORY) keep.add(snapshot.commitSha);
    });

  for (const snapshot of snapshots) {
    if (!keep.has(snapshot.commitSha)) await deleteSnapshot(db, snapshot);
  }
}

export async function clearVaultCache(repoId) {
  const db = await database();
  const snapshots = await db.getAllFromIndex("snapshots", "byRepo", repoId);
  for (const snapshot of snapshots) await deleteSnapshot(db, snapshot);

  const files = await db.getAll("files");
  const histories = await db.getAll("fileHistories");
  const tx = db.transaction(["files", "fileHistories", "repositories"], "readwrite");
  for (const file of files) {
    if (file.repoId === repoId) await tx.objectStore("files").delete(file.key);
  }
  for (const history of histories) {
    if (history.repoId === repoId) await tx.objectStore("fileHistories").delete(history.key);
  }
  await tx.objectStore("repositories").delete(repoId);
  await tx.done;
}
