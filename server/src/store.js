'use strict';

// Simple in-memory OR-Set store with presence tracking

function createRoomState() {
  return {
    version: 0,
    idToHighlight: new Map(), // id -> highlight { tombstone?: true }
    userIdToPresence: new Map(), // userId -> { user, color, lastSeen }
  };
}

function materializeHighlights(state) {
  const arr = [];
  for (const h of state.idToHighlight.values()) {
    if (!h.tombstone) arr.push(h);
  }
  // sort by timestamp then id for stable ordering
  arr.sort((a, b) => (a.timestamp - b.timestamp) || (a.id < b.id ? -1 : 1));
  return arr;
}

function createStore() {
  const roomKeyToState = new Map();

  function ensure(key) {
    if (!roomKeyToState.has(key)) roomKeyToState.set(key, createRoomState());
    return roomKeyToState.get(key);
  }

  return {
    getState(roomKey) {
      const state = ensure(roomKey);
      return {
        version: state.version,
        highlights: materializeHighlights(state),
      };
    },

    applyAdd(roomKey, highlight) {
      const state = ensure(roomKey);
      // Last-write wins on timestamp, stable on id for ties
      const prev = state.idToHighlight.get(highlight.id);
      if (!prev || prev.tombstone || prev.timestamp <= highlight.timestamp) {
        state.idToHighlight.set(highlight.id, { ...highlight, tombstone: false });
      }
      state.version += 1;
      return state.idToHighlight.get(highlight.id);
    },

    applyRemove(roomKey, id) {
      const state = ensure(roomKey);
      const prev = state.idToHighlight.get(id);
      if (!prev) return null;
      if (!prev.tombstone) {
        state.idToHighlight.set(id, { ...prev, tombstone: true, timestamp: Date.now() });
        state.version += 1;
      }
      return id;
    },

    updatePresence(roomKey, presence) {
      const state = ensure(roomKey);
      state.userIdToPresence.set(presence.user.id, presence);
    },

    listPresence(roomKey) {
      const state = ensure(roomKey);
      return Array.from(state.userIdToPresence.values());
    },

    removePresence(roomKey, userId) {
      const state = ensure(roomKey);
      state.userIdToPresence.delete(userId);
    },
  };
}

module.exports = { createStore };

