import type { MovementClaimState } from "@/movement-center/types";

export function isResolvedMovementState(state: MovementClaimState): boolean {
  return state === "completed" || state === "official" || state === "fell_through";
}

export function isFellThroughMovementState(state: MovementClaimState): boolean {
  return state === "fell_through";
}

export function movementStateLabel(state: MovementClaimState): string | null {
  switch (state) {
    case "completed":
      return "Completed";
    case "official":
      return "Official";
    case "fell_through":
      return "Fell through";
    case "denied":
      return "Denied";
    case "retracted":
      return "Retracted";
    case "expired":
      return "Expired";
    default:
      return null;
  }
}
