import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import "./CameraSelect.css";

/** Theme-owned, keyboard-accessible menu. Native Windows popup colors are not reliable. */
export function CameraSelect({ value, onChange, disabled, label, children }: { value: string | number; onChange: (value: string) => void; disabled?: boolean; label: string; children: ReactNode }) {
  const options = Children.toArray(children).filter(isValidElement<{ value: string | number; disabled?: boolean; children: ReactNode }>).map(child => ({ value: String(child.props.value), disabled: child.props.disabled, label: child.props.children }));
  const selected = options.findIndex(option => option.value === String(value)), [open, setOpen] = useState(false), [active, setActive] = useState(0), [position, setPosition] = useState({ top: 0, left: 0, width: 0, height: 240 });
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), id = useId();
  const choose = (index: number) => { if (!options[index] || options[index].disabled) return; onChange(options[index].value); setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const place = () => { const r = trigger.current?.getBoundingClientRect(); if (!r) return; const below = innerHeight - r.bottom - 12, above = r.top - 12, down = below >= Math.min(240, above), height = Math.max(80, Math.min(300, down ? below : above)); setPosition({ top: down ? r.bottom + 6 : r.top - height - 6, left: Math.max(8, Math.min(r.left, innerWidth - r.width - 8)), width: Math.min(r.width, innerWidth - 16), height }); };
    const outside = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false); };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true); document.addEventListener("pointerdown", outside, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("pointerdown", outside, true); };
  }, [open]);
  useEffect(() => { if (open) menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);
  const move = (direction: number, start = active) => { for (let n = 1; n <= options.length; n++) { const next = (start + direction * n + options.length * 2) % options.length; if (!options[next].disabled) { setActive(next); break; } } };
  return <><button ref={trigger} type="button" className="camera-select" role="combobox" aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined} aria-haspopup="listbox" disabled={disabled} onClick={() => { setActive(Math.max(0, selected)); setOpen(!open); }} onKeyDown={e => {
    if (e.key === "Escape") { if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); } return; }
    if (e.key === "Tab") { setOpen(false); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(e.key)) { e.preventDefault(); if (!open) { setActive(Math.max(0, selected)); setOpen(true); } else if (e.key === "ArrowDown" || e.key === "ArrowUp") move(e.key === "ArrowDown" ? 1 : -1); else if (e.key === "Home") move(1, -1); else if (e.key === "End") move(-1, options.length); else choose(active); }
  }}><span>{options[selected]?.label ?? "—"}</span><ChevronDown size={16}/></button>{open && createPortal(<div ref={menu} id={id} role="listbox" aria-label={label} className="camera-select-menu" dir={trigger.current?.closest("[dir]")?.getAttribute("dir") ?? document.documentElement.dir} style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.height }}>
    {options.map((option, index) => <div key={`${option.value}:${index}`} id={`${id}-${index}`} data-index={index} role="option" aria-selected={index === selected} aria-disabled={option.disabled || undefined} className={index === active ? "is-active" : ""} onPointerDown={e => e.preventDefault()} onMouseMove={() => { if (!option.disabled) setActive(index); }} onClick={() => choose(index)}><span>{option.label}</span>{index === selected && <Check size={16}/>}</div>)}
  </div>, trigger.current?.closest("dialog") ?? document.body)}</>;
}
