import { cn } from "@/lib/utils";

type Props = {
  /** Which screen the slot sits on — kept on the element for wiring up real ads later. */
  placement: "home" | "history" | "settle";
  /** banner: one 3:1 creative · product: a row of square product cards. */
  type: "banner" | "product";
  /** Product slots only: number of cards in the row. */
  count?: number;
  className?: string;
};

/** Reserved ad space. Renders a fixed-size placeholder so layouts are
 * final before any ad source is connected. */
export function AdSlot({ placement, type, count = 2, className }: Props) {
  return (
    <aside
      aria-label="Advertisement"
      data-ad-placement={placement}
      data-ad-type={type}
      className={cn("mb-6", className)}
    >
      {type === "banner" ? (
        <Placeholder className="aspect-3/1" size="1200 × 400" />
      ) : (
        <div className={cn("grid gap-3", count > 1 && "grid-cols-2")}>
          {Array.from({ length: count }, (_, i) => (
            <Placeholder key={i} className="aspect-square" size="Product · 1:1" />
          ))}
        </div>
      )}
    </aside>
  );
}

function Placeholder({ className, size }: { className: string; size: string }) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-secondary/40 text-muted-foreground",
        className,
      )}
    >
      <span className="text-[10px] font-bold tracking-[0.2em]">AD SPACE</span>
      <span className="tabular text-[10px]">{size}</span>
    </div>
  );
}
