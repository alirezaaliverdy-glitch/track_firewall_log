import { Check, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { setAppearance, useAppearance, type Appearance } from "@/lib/appearance";
import "./AppearanceSettings.css";

export function AppearanceSettings({ isFa }: { isFa: boolean }) {
  const selected = useAppearance();
  const [saved, setSaved] = useState(true);
  return <section className="appearance-settings" aria-labelledby="appearance-title">
    <header><span className="appearance-icon"><Sun aria-hidden="true" /></span><div>
      <h2 id="appearance-title">{isFa ? "ظاهر برنامه" : "Appearance"}</h2>
      <p>{isFa ? "فضایی که با سلیقهٔ شما هماهنگ است." : "A workspace that feels right for you."}</p>
    </div></header>
    <fieldset className="appearance-options">
      <legend className="sr-only">{isFa ? "انتخاب رنگ صفحه" : "Choose a theme"}</legend>
      {(["light", "dark"] as Appearance[]).map(value => <label key={value} className={`appearance-option appearance-option--${value}`}>
        <input type="radio" name="appearance" value={value} checked={selected === value} onChange={() => setSaved(setAppearance(value))} />
        <span className="appearance-preview" aria-hidden="true"><span className="appearance-preview__nav"><i /><i /><i /></span><span className="appearance-preview__body"><b /><span><i /><i /><i /></span><em><i /><i /><i /></em></span></span>
        <span className="appearance-option__label">{value === "light" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}<strong>{value === "light" ? (isFa ? "روشن" : "Light") : (isFa ? "تیره" : "Dark")}</strong><span className="appearance-check" aria-hidden="true">{selected === value ? <Check /> : null}</span></span>
      </label>)}
    </fieldset>
    <p className="appearance-saved" role="status">{saved ? (isFa ? "انتخاب شما در همین مرورگر ذخیره می‌شود." : "Your choice is saved in this browser.") : (isFa ? "تم تغییر کرد؛ مرورگر اجازهٔ ذخیرهٔ انتخاب را نمی‌دهد." : "Theme changed; this browser does not allow saving the preference.")}</p>
  </section>;
}
