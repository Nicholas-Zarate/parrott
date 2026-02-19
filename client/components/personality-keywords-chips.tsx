"use client";

import { useState, useId } from "react";
import { Sparkles, Plus, Minus } from "lucide-react";
import { Dialog, Tooltip } from "radix-ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COMING_SOON_TOOLTIP = "Coming soon boys";

/** Passive = shadcn outline chip; gradient only on hover/active. */
const CHIP_BASE =
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-150 select-none cursor-pointer ";
const CHIP_PASSIVE =
  "border-border bg-transparent text-foreground ";
/** Applied when chip body is hovered (state-driven) so you can tune hover/active here. */
const CHIP_LOOK_HOVERED =
  "border-transparent bg-gradient-to-r from-orange-400 to-red-400 text-white scale-105 shadow ";
const CHIP_LOOK_ACTIVE = "scale-[0.98] from-orange-600 to-red-600 ";

type PersonalityKeywordsChipsProps = {
  keywords: string[];
  /** When true, add/edit (and remove) are disabled and show "Coming soon boys" tooltip. */
  addEditDisabled?: boolean;
};

export function PersonalityKeywordsChips({
  keywords,
  addEditDisabled = true,
}: PersonalityKeywordsChipsProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  /** Which chip body is hovered (for gradient). */
  const [chipHoveredKey, setChipHoveredKey] = useState<string | null>(null);
  /** Which chip's remove button is hovered (for grey chip + keep button visible). */
  const [removeButtonHoveredKey, setRemoveButtonHoveredKey] = useState<string | null>(null);
  const titleId = useId();
  const descId = useId();

  const showRemoveButton = (kw: string) =>
    !addEditDisabled && (chipHoveredKey === kw || removeButtonHoveredKey === kw);
  const isRemoveHovered = (kw: string) => removeButtonHoveredKey === kw;
  const isChipHovered = (kw: string) => chipHoveredKey === kw && !removeButtonHoveredKey;

  const handleAddClick = () => {
    if (addEditDisabled) return;
    setNewName("");
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    // TODO: persist new keyword when API exists
    setModalOpen(false);
    setNewName("");
  };

  const handleRemove = (_kw: string) => {
    if (addEditDisabled) return;
    // TODO: persist removal when API exists
  };

  return (
    <>
      <section className="relative rounded-lg border border-border bg-muted/20 px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Sparkles className="size-4 shrink-0" aria-hidden />
          Personality keywords
        </div>
        <div className="flex flex-wrap gap-2 pr-10">
          {keywords.map((kw) => (
            <span
              key={kw}
              title={addEditDisabled ? COMING_SOON_TOOLTIP : undefined}
              aria-disabled={addEditDisabled}
              className={cn(
                CHIP_BASE,
                CHIP_PASSIVE,
                "relative px-1 pt-1 pb-0.5 transition-colors duration-150",
                addEditDisabled && "cursor-not-allowed opacity-90",
                isChipHovered(kw) && !addEditDisabled && CHIP_LOOK_HOVERED,
                isRemoveHovered(kw) && !addEditDisabled && "bg-muted/50 border-border text-foreground shadow-none scale-100"
              )}
              onMouseEnter={() => !addEditDisabled && setChipHoveredKey(kw)}
              onMouseLeave={() => {
                setChipHoveredKey(null);
                setRemoveButtonHoveredKey(null);
              }}
            >
              <span className="capitalize">{kw.replace(/-/g, " ")}</span>
              {/* Remove button: state-driven visibility so it stays visible when hovering the button (shadcn-style removable badge) */}
              <span
                className={cn(
                  "absolute right-0 top-0 flex size-4 shrink-0 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-red-500 p-[2px] transition-opacity duration-150",
                  showRemoveButton(kw) ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                aria-hidden
                onMouseEnter={() => setRemoveButtonHoveredKey(kw)}
                onMouseLeave={() => setRemoveButtonHoveredKey(null)}
              >
                <span className="flex size-full items-center justify-center rounded-full bg-white">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(kw);
                    }}
                    disabled={addEditDisabled}
                    title={addEditDisabled ? COMING_SOON_TOOLTIP : undefined}
                    className="flex size-full items-center justify-center rounded-full text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={addEditDisabled ? COMING_SOON_TOOLTIP : `Remove ${kw}`}
                  >
                    <Minus className="size-2.5" strokeWidth={2.5} />
                  </button>
                </span>
              </span>
            </span>
          ))}
        </div>
        <div className="absolute bottom-3 right-3">
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <span className="inline-flex">
                  <button
                    type="button"
                    onClick={handleAddClick}
                    disabled={addEditDisabled}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border transition-all",
                      addEditDisabled
                        ? "cursor-not-allowed border-transparent bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm disabled:pointer-events-none disabled:opacity-90"
                        : "border-border bg-transparent text-foreground hover:border-transparent hover:bg-gradient-to-r hover:from-orange-400 hover:to-red-500 hover:text-white hover:scale-110 hover:shadow active:scale-95 active:from-orange-600 active:to-red-600"
                    )}
                    aria-label={addEditDisabled ? COMING_SOON_TOOLTIP : "Add keyword"}
                  >
                    <Plus className="size-4" />
                  </button>
                </span>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="left"
                  sideOffset={6}
                  className="z-50 max-w-[200px] rounded-md border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
                >
                  {addEditDisabled ? COMING_SOON_TOOLTIP : "Add keyword"}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
      </section>

      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-4 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
            aria-labelledby={titleId}
            aria-describedby={descId}
          >
            <Dialog.Title
              id={titleId}
              className="text-lg font-semibold text-foreground"
            >
              Name your keyword
            </Dialog.Title>
            <Dialog.Description
              id={descId}
              className="mt-1 text-sm text-muted-foreground"
            >
              Add a short label for this personality trait (e.g. Witty, Casual).
            </Dialog.Description>
            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
              <Input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Witty"
                className="w-full"
                autoFocus
                maxLength={32}
                aria-label="Keyword name"
              />
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline" size="sm">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-400 hover:to-red-400"
                  disabled={!newName.trim()}
                >
                  Add
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
