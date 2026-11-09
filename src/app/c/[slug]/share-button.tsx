"use client";

import { Icon } from "@/components/icon";
import { useToast } from "@/components/toaster";

export function ShareButton() {
  const toast = useToast();
  const share = async () => {
    const url = window.location.href.split("?")[0];
    try {
      if (navigator.share) await navigator.share({ url, title: document.title });
      else {
        await navigator.clipboard.writeText(url);
        toast("Link copied");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast("Couldn't share. Copy the address bar instead.", { error: true });
    }
  };
  return (
    <button className="btn btn-ghost btn-sm" type="button" onClick={share}>
      <Icon name="share" small /> Share
    </button>
  );
}
