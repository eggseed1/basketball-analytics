"use client";
import { useParams } from "next/navigation";
import { GmShell } from "@/gm/ui/gm-shell";
import { GmContractNegotiation } from "@/gm/ui/gm-contract-negotiation";

export default function ExtensionOfferPage() {
  const params = useParams<{ playerId: string }>();
  return <GmShell><GmContractNegotiation mode="extension" playerId={params.playerId} /></GmShell>;
}
