
// lib/location/validate.ts

import type { Location } from "./types";

export interface LocationValidationIssue {
  path: string;
  message: string;
}

export interface LocationValidationResult {
  ok: boolean;
  issues: LocationValidationIssue[];
}

/**
 * Runtime validation for Location objects to ensure structural integrity.
 */
export function validateLocation(loc: Location): LocationValidationResult {
  const issues: LocationValidationIssue[] = [];

  // ID / name
  if (!loc.id) {
    issues.push({ path: "id", message: "Location.id is empty" });
  }
  if (!loc.name) {
    issues.push({ path: "name", message: "Location.name is empty" });
  }

  // Topology
  if (!loc.topology) {
    issues.push({ path: "topology", message: "Topology block is missing" });
  } else {
    if (!Array.isArray(loc.topology.connections)) {
      issues.push({
        path: "topology.connections",
        message: "topology.connections must be an array",
      });
    }
    if (!Array.isArray(loc.topology.zones)) {
      issues.push({
        path: "topology.zones",
        message: "topology.zones must be an array",
      });
    }
  }

  // Physics
  if (!loc.physics) {
    issues.push({
      path: "physics",
      message: "physics profile is missing",
    });
  }

  // Affordances
  if (!Array.isArray(loc.affordances)) {
    issues.push({
      path: "affordances",
      message: "affordances must be an array (can be empty)",
    });
  }

  // State
  if (!loc.state) {
    issues.push({
      path: "state",
      message: "state block is missing",
    });
  } else {
    if (!Array.isArray(loc.state.presenceAgents)) {
      issues.push({
        path: "state.presenceAgents",
        message: "state.presenceAgents must be an array",
      });
    }
    if (!loc.state.resources) {
      issues.push({
        path: "state.resources",
        message: "state.resources object is missing",
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
