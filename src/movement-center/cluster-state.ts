import type { MovementClaimState } from "@/movement-center/types";

export function isResolvedMovementState(state: MovementClaimState): boolean {
  return state === "completed" || state === "official";
}

export function movementStateLabel(state: MovementClaimState): string | null {
  switch (state) {
    case "completed":
      return "Completed";
    case "official":
      return "Official";
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
