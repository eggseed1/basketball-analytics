import { redirect } from "next/navigation";

/** Leaders folded into Players; keep the old URL working. */
export default function GmLeadersRedirect() {
  redirect("/gm/players");
}
