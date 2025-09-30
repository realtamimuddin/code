/**
 * CRDT-based Conflict Resolution for Code Review Highlights
 * Implements a simplified Last-Write-Wins CRDT with vector clocks
 */

class VectorClock {
  constructor(nodeId) {
    this.nodeId = nodeId;
    this.clock = new Map();
    this.clock.set(nodeId, 0);
  }

  tick() {
    const current = this.clock.get(this.nodeId) || 0;
    this.clock.set(this.nodeId, current + 1);
    return this.getClock();
  }

  update(otherClock) {
    for (const [nodeId, timestamp] of Object.entries(otherClock)) {
      const currentTimestamp = this.clock.get(nodeId) || 0;
      this.clock.set(nodeId, Math.max(currentTimestamp, timestamp));
    }
  }

  getClock() {
    return Object.fromEntries(this.clock);
  }

  compare(otherClock) {
    const allNodes = new Set([
      ...this.clock.keys(),
      ...Object.keys(otherClock)
    ]);

    let thisGreater = false;
    let otherGreater = false;

    for (const nodeId of allNodes) {
      const thisTimestamp = this.clock.get(nodeId) || 0;
      const otherTimestamp = otherClock[nodeId] || 0;

      if (thisTimestamp > otherTimestamp) {
        thisGreater = true;
      } else if (thisTimestamp < otherTimestamp) {
        otherGreater = true;
      }
    }

    if (thisGreater && !otherGreater) return 1;   // This is greater
    if (otherGreater && !thisGreater) return -1;  // Other is greater
    if (thisGreater && otherGreater) return 0;    // Concurrent
    return 0; // Equal
  }

  happensBefore(otherClock) {
    return this.compare(otherClock) === -1;
  }

  happensAfter(otherClock) {
    return this.compare(otherClock) === 1;
  }

  isConcurrent(otherClock) {
    const comparison = this.compare(otherClock);
    return comparison === 0 && !this.equals(otherClock);
  }

  equals(otherClock) {
    const allNodes = new Set([
      ...this.clock.keys(),
      ...Object.keys(otherClock)
    ]);

    for (const nodeId of allNodes) {
      const thisTimestamp = this.clock.get(nodeId) || 0;
      const otherTimestamp = otherClock[nodeId] || 0;
      if (thisTimestamp !== otherTimestamp) return false;
    }

    return true;
  }
}

class HighlightCRDT {
  constructor(userId) {
    this.userId = userId;
    this.vectorClock = new VectorClock(userId);
    this.highlights = new Map(); // Map<highlightId, HighlightEntry>
    this.tombstones = new Set(); // Set<highlightId> for deleted items
  }

  // Create or update a highlight
  addHighlight(highlightData) {
    const clock = this.vectorClock.tick();
    const entry = {
      ...highlightData,
      vectorClock: clock,
      timestamp: Date.now(),
      userId: this.userId,
      version: this.generateVersion(highlightData.id, clock)
    };

    this.highlights.set(highlightData.id, entry);
    this.tombstones.delete(highlightData.id); // Remove from tombstones if it was deleted

    return entry;
  }

  // Remove a highlight
  removeHighlight(highlightId) {
    const clock = this.vectorClock.tick();
    const tombstone = {
      id: highlightId,
      vectorClock: clock,
      timestamp: Date.now(),
      userId: this.userId,
      deleted: true,
      version: this.generateVersion(highlightId, clock)
    };

    this.highlights.delete(highlightId);
    this.tombstones.add(highlightId);

    return tombstone;
  }

  // Merge state from another CRDT instance
  merge(otherState) {
    const conflicts = [];
    
    // Update our vector clock
    this.vectorClock.update(otherState.vectorClock || {});

    // Process highlights from other state
    for (const [highlightId, otherEntry] of Object.entries(otherState.highlights || {})) {
      const localEntry = this.highlights.get(highlightId);
      const result = this.resolveConflict(localEntry, otherEntry, highlightId);
      
      if (result.hasConflict) {
        conflicts.push(result);
      }

      if (result.winner === 'other') {
        this.highlights.set(highlightId, otherEntry);
        this.tombstones.delete(highlightId);
      } else if (result.winner === 'tombstone') {
        this.highlights.delete(highlightId);
        this.tombstones.add(highlightId);
      }
    }

    // Process tombstones from other state
    for (const tombstoneId of otherState.tombstones || []) {
      if (this.highlights.has(tombstoneId)) {
        const localEntry = this.highlights.get(tombstoneId);
        const otherTombstone = {
          id: tombstoneId,
          deleted: true,
          vectorClock: otherState.vectorClock || {},
          timestamp: otherState.timestamp || Date.now()
        };

        const result = this.resolveConflict(localEntry, otherTombstone, tombstoneId);
        
        if (result.hasConflict) {
          conflicts.push(result);
        }

        if (result.winner === 'other') {
          this.highlights.delete(tombstoneId);
          this.tombstones.add(tombstoneId);
        }
      } else {
        this.tombstones.add(tombstoneId);
      }
    }

    return conflicts;
  }

  // Resolve conflicts between two entries
  resolveConflict(localEntry, otherEntry, highlightId) {
    const result = {
      highlightId,
      hasConflict: false,
      winner: null,
      conflictType: null,
      localEntry,
      otherEntry
    };

    // If we don't have local entry, other wins
    if (!localEntry) {
      result.winner = 'other';
      return result;
    }

    // If other entry is a deletion
    if (otherEntry.deleted) {
      const clockComparison = this.vectorClock.compare(otherEntry.vectorClock);
      
      if (clockComparison === -1) { // Other deletion happened after our highlight
        result.winner = 'other'; // Deletion wins
        result.hasConflict = true;
        result.conflictType = 'delete_vs_update';
      } else {
        result.winner = 'local'; // Our highlight is newer
      }
      
      return result;
    }

    // Compare vector clocks
    const localClock = localEntry.vectorClock || {};
    const otherClock = otherEntry.vectorClock || {};
    
    const clockComparison = this.compareVectorClocks(localClock, otherClock);

    if (clockComparison === 1) {
      // Local is newer
      result.winner = 'local';
    } else if (clockComparison === -1) {
      // Other is newer
      result.winner = 'other';
    } else {
      // Concurrent updates - need to resolve conflict
      result.hasConflict = true;
      result.conflictType = 'concurrent_update';
      result.winner = this.resolveConcurrentConflict(localEntry, otherEntry);
    }

    return result;
  }

  // Resolve concurrent conflicts using business logic
  resolveConcurrentConflict(localEntry, otherEntry) {
    // Strategy 1: Last writer wins (based on timestamp)
    if (localEntry.timestamp > otherEntry.timestamp) {
      return 'local';
    } else if (localEntry.timestamp < otherEntry.timestamp) {
      return 'other';
    }
    
    // Strategy 2: User ID comparison for deterministic resolution
    if (localEntry.userId > otherEntry.userId) {
      return 'local';
    } else {
      return 'other';
    }
  }

  // Compare vector clocks
  compareVectorClocks(clock1, clock2) {
    const allNodes = new Set([
      ...Object.keys(clock1),
      ...Object.keys(clock2)
    ]);

    let clock1Greater = false;
    let clock2Greater = false;

    for (const nodeId of allNodes) {
      const timestamp1 = clock1[nodeId] || 0;
      const timestamp2 = clock2[nodeId] || 0;

      if (timestamp1 > timestamp2) {
        clock1Greater = true;
      } else if (timestamp1 < timestamp2) {
        clock2Greater = true;
      }
    }

    if (clock1Greater && !clock2Greater) return 1;
    if (clock2Greater && !clock1Greater) return -1;
    return 0; // Concurrent or equal
  }

  // Generate a unique version identifier
  generateVersion(highlightId, vectorClock) {
    const clockString = Object.entries(vectorClock)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nodeId, timestamp]) => `${nodeId}:${timestamp}`)
      .join(',');
    
    return `${highlightId}@${clockString}`;
  }

  // Get current state for synchronization
  getState() {
    return {
      userId: this.userId,
      vectorClock: this.vectorClock.getClock(),
      highlights: Object.fromEntries(this.highlights),
      tombstones: Array.from(this.tombstones),
      timestamp: Date.now()
    };
  }

  // Get all active highlights
  getHighlights() {
    return Array.from(this.highlights.values())
      .filter(highlight => !this.tombstones.has(highlight.id));
  }

  // Check if a highlight exists and is not deleted
  hasHighlight(highlightId) {
    return this.highlights.has(highlightId) && !this.tombstones.has(highlightId);
  }

  // Get a specific highlight
  getHighlight(highlightId) {
    if (this.hasHighlight(highlightId)) {
      return this.highlights.get(highlightId);
    }
    return null;
  }

  // Clear all highlights by this user
  clearUserHighlights() {
    const deletedHighlights = [];
    
    for (const [highlightId, highlight] of this.highlights) {
      if (highlight.userId === this.userId) {
        const tombstone = this.removeHighlight(highlightId);
        deletedHighlights.push(tombstone);
      }
    }
    
    return deletedHighlights;
  }

  // Get statistics
  getStats() {
    const activeHighlights = this.getHighlights();
    const userHighlights = activeHighlights.filter(h => h.userId === this.userId);
    
    return {
      totalHighlights: activeHighlights.length,
      userHighlights: userHighlights.length,
      tombstones: this.tombstones.size,
      vectorClockSize: Object.keys(this.vectorClock.getClock()).length
    };
  }
}

// Factory function for creating CRDT instances
function createHighlightCRDT(userId) {
  return new HighlightCRDT(userId);
}

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HighlightCRDT, VectorClock, createHighlightCRDT };
} else if (typeof window !== 'undefined') {
  window.HighlightCRDT = HighlightCRDT;
  window.VectorClock = VectorClock;
  window.createHighlightCRDT = createHighlightCRDT;
}