export function createInMemoryContentItemsRepository() {
  const items = new Map();

  return {
    async initialize() {},
    async getContentItem(id) {
      return items.get(id) ?? null;
    },
    async saveContentItem(record) {
      items.set(record.id, record);
      return record;
    },
    async listContentItems(filters = {}) {
      return [...items.values()]
        .filter((item) => (filters.status ? item.status === filters.status : true))
        .filter((item) => (filters.contentType ? item.contentType === filters.contentType : true))
        .filter((item) =>
          filters.topic ? item.topicTags?.includes(String(filters.topic).trim().toLowerCase()) : true
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    async deleteContentItem(id) {
      return items.delete(id);
    }
  };
}

export function createInMemoryGoalTypesRepository() {
  const goalTypes = new Map();

  return {
    async initialize() {},
    async getGoalType(id) {
      return goalTypes.get(id) ?? null;
    },
    async saveGoalType(record) {
      goalTypes.set(record.id, record);
      return record;
    },
    async listGoalTypes(filters = {}) {
      return [...goalTypes.values()]
        .filter((goalType) =>
          filters.activeOption === undefined ? true : goalType.isActiveOption === filters.activeOption
        )
        .sort((left, right) => left.id.localeCompare(right.id));
    }
  };
}

export function createInMemoryUserHomesRepository() {
  const homes = new Map();

  return {
    async initialize() {},
    async getUserHome(userId) {
      return homes.get(userId) ?? null;
    },
    async saveUserHome(record) {
      homes.set(record.id, record);
      return record;
    },
    async listUserHomes() {
      return [...homes.values()].sort((left, right) => left.id.localeCompare(right.id));
    }
  };
}

export function createInMemoryAssetStore() {
  const assets = new Map();
  const previews = new Map();

  return {
    async initialize() {},
    async saveUploadedFile({ contentId, file }) {
      assets.set(contentId, {
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        bytes: file.buffer
      });
      return {
        kind: "uploaded-file",
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey: contentId
      };
    },
    async getAssetForItem(contentId) {
      return assets.get(contentId) ?? null;
    },
    async savePreviewForItem(contentId, preview) {
      previews.set(contentId, preview);
    },
    async getPreviewForItem(contentId) {
      return previews.get(contentId) ?? null;
    },
    async removeAssetForItem(contentId) {
      assets.delete(contentId);
      previews.delete(contentId);
    }
  };
}

function isFreshRawRecord(record, { now = new Date(), maxAgeMs = null } = {}) {
  if (!record?.summaryJson || !record?.timelineJson) {
    return false;
  }

  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    return true;
  }

  const updatedAt = Date.parse(record.updatedAt ?? record.createdAt ?? "");
  return Number.isFinite(updatedAt) && now.getTime() - updatedAt <= maxAgeMs;
}

export function createInMemoryRiotMatchesRepository() {
  const rawMatches = new Map();
  const perspectives = new Map();

  return {
    async initialize() {},
    async getRawMatchData(matchId) {
      return rawMatches.get(matchId) ?? null;
    },
    async saveRawMatchData({ matchId, summaryJson, timelineJson, now = new Date() }) {
      const existing = rawMatches.get(matchId);
      const timestamp = now.toISOString();
      const record = {
        matchId,
        summaryJson,
        timelineJson,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp
      };
      rawMatches.set(matchId, record);
      return record;
    },
    async hasFreshRawMatchData(matchId, options) {
      return isFreshRawRecord(rawMatches.get(matchId), options);
    },
    async getUserMatchPerspective(matchId, puuid) {
      return perspectives.get(`${matchId}:${puuid}`) ?? null;
    },
    async saveUserMatchPerspective(record, { now = new Date() } = {}) {
      const key = `${record.matchId}:${record.puuid}`;
      const existing = perspectives.get(key);
      const timestamp = now.toISOString();
      const nextRecord = {
        ...existing,
        ...record,
        createdAt: existing?.createdAt ?? record.createdAt ?? timestamp,
        updatedAt: timestamp
      };
      perspectives.set(key, nextRecord);
      return nextRecord;
    },
    async listRecentGameCardsForUser({ puuid, matchIds = null, limit = 10 }) {
      const ids = Array.isArray(matchIds) && matchIds.length > 0 ? matchIds : null;
      const idOrder = new Map((ids ?? []).map((matchId, index) => [matchId, index]));
      return [...perspectives.values()]
        .filter((record) => record.puuid === puuid)
        .filter((record) => (ids ? idOrder.has(record.matchId) : true))
        .sort((left, right) => {
          if (ids) {
            return idOrder.get(left.matchId) - idOrder.get(right.matchId);
          }
          return String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""));
        })
        .slice(0, limit)
        .map((record) => ({
          matchId: record.matchId,
          puuid: record.puuid,
          record,
          updatedAt: record.updatedAt
        }));
    }
  };
}
