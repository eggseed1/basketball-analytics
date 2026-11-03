"use client";
import { useParams } from "next/navigation";
import { GmShell } from "@/gm/ui/gm-shell";
import { GmContractNegotiation } from "@/gm/ui/gm-contract-negotiation";

export default function FreeAgentOfferPage() {
  const params = useParams<{ playerId: string }>();
  return <GmShell><GmContractNegotiation mode="free-agent" playerId={params.playerId} /></GmShell>;
}
