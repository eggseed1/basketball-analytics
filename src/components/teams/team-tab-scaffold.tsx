import { GlassSurface } from "@/components/brand/glass-surface";
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
      <GlassSurface effect="css" className="flex flex-col gap-3 p-4 sm:p-5">
        <div>
          <h2 className={type.heading}>{title}</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            {reason}
          </p>
        </div>
        <ul className="flex flex-col gap-1.5">
          {planned.map((item) => (
            <li key={item} className={cn(type.bodySm, "text-muted-foreground")}>
              · {item}
            </li>
          ))}
        </ul>
      </GlassSurface>
    </section>
  );
}
