import { useEffect, useRef, useState } from "react";
type CaptchaApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => number;
  reset: (id: number) => void;
  getResponse: (id: number) => string;
};
declare global {
  interface Window {
    grecaptcha?: CaptchaApi;
    publicCaptchaReady?: () => void;
  }
}
let loading: Promise<void> | undefined;
function load() {
  if (window.grecaptcha?.render) return Promise.resolve();
  if (!loading)
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      window.publicCaptchaReady = resolve;
      script.src =
        "https://www.google.com/recaptcha/api.js?onload=publicCaptchaReady&render=explicit";
      script.async = true;
      script.onerror = () => {
        loading = undefined;
        script.remove();
        reject(new Error("unavailable"));
      };
      document.head.appendChild(script);
    });
  return loading;
}
export function Recaptcha({ state }: { state: string }) {
  const box = useRef<HTMLDivElement>(null),
    widget = useRef<number | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const form = box.current?.closest("form");
    const guard = (event: Event) => {
      if (
        widget.current === undefined ||
        !window.grecaptcha?.getResponse(widget.current)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setError("Please complete the security check before sending.");
      }
    };
    form?.addEventListener("submit", guard);
    load()
      .then(() => {
        if (active && box.current)
          widget.current = window.grecaptcha!.render(box.current, {
            sitekey: "6Lej-vUtAAAAAAABw0neBj2sw8LTNH9vvJiOa5WM",
            size: window.innerWidth < 380 ? "compact" : "normal",
            callback: () => setError(""),
            "expired-callback": () =>
              setError("The check expired. Please complete it again."),
            "error-callback": () =>
              setError(
                "The security check could not load. Reload to retry, or use the email link.",
              ),
          });
      })
      .catch(() => {
        if (active)
          setError(
            "The security check could not load. Reload to retry, or use the email link.",
          );
      });
    return () => {
      active = false;
      form?.removeEventListener("submit", guard);
    };
  }, []);
  useEffect(() => {
    if (
      (state === "error" || state === "success" || state === "done") &&
      widget.current !== undefined
    )
      window.grecaptcha?.reset(widget.current);
  }, [state]);
  return (
    <div style={{ width: "100%", marginTop: 16 }}>
      <div ref={box} />
      {error && (
        <p role="alert" style={{ fontSize: 13, marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}
