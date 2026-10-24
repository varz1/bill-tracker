import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

interface Props {
  title: string;
  onClose(): void;
  children: ReactNode;
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Modal({ title, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-5 pt-4 pb-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-md p-2 text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
