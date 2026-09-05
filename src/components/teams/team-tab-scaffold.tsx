import { Surface } from "@/components/ui/surface";
import { SectionHeader } from "@/components/layout/page-header";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export function TeamTabScaffold({
  id,
  title,
  reason,
  planned,
}: {
  id: string;
  title: string;
  reason: string;
  planned: string[];
}) {
  return (
    <section id={id} className="scroll-mt-16" aria-label={title}>
      <Surface variant="glass" padding="md" className="flex flex-col gap-3">
        <SectionHeader title={title} description={reason} />
        <ul className="flex flex-col gap-1.5">
          {planned.map((item) => (
            <li key={item} className={cn(type.bodySm, "text-muted-foreground")}>
              · {item}
            </li>
          ))}
        </ul>
      </Surface>
    </section>
  );
}
