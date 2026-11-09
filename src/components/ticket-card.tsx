import type { CSSProperties, ReactNode } from "react";

export type TicketStock = "paper" | "pink" | "butter" | "mint" | "lilac" | "night";
export type TicketPattern = "guilloche" | "halftone" | "stripes" | "plain";

export const STOCKS: Record<TicketStock, { color: string; ink: string; label: string }> = {
  paper: { color: "#fffaf0", ink: "#16130f", label: "Paper" },
  pink: { color: "#fde9f1", ink: "#16130f", label: "Riso pink" },
  butter: { color: "#fff4c9", ink: "#16130f", label: "Butter" },
  mint: { color: "#e6f2ee", ink: "#16130f", label: "Mint" },
  lilac: { color: "#eef0fb", ink: "#16130f", label: "Lilac" },
  night: { color: "#1d1a16", ink: "#f4f0e8", label: "Night" },
};

/** Stored on Event.ticketStock as "<stock>:<pattern>". */
export function parseTicketStyle(value: string): { stock: TicketStock; pattern: TicketPattern } {
  const [stock, pattern] = value.split(":");
  return {
    stock: (stock in STOCKS ? stock : "paper") as TicketStock,
    pattern: (["guilloche", "halftone", "stripes", "plain"].includes(pattern) ? pattern : "guilloche") as TicketPattern,
  };
}

/** The physical ticket: a body and a stub joined by a perforation. Purely presentational. */
export function TicketCard({
  name,
  kicker,
  price,
  priceNote,
  priceNoteHot = false,
  perks,
  serial,
  stock = "paper",
  pattern = "guilloche",
  stamp,
  children,
  className = "",
}: {
  name: string;
  kicker: string;
  price: string;
  priceNote?: string;
  priceNoteHot?: boolean;
  perks?: string | null;
  serial?: string;
  stock?: TicketStock;
  pattern?: TicketPattern;
  stamp?: string;
  children?: ReactNode;
  className?: string;
}) {
  const style = { "--stock": STOCKS[stock].color, "--stock-ink": STOCKS[stock].ink } as CSSProperties;
  return (
    <div className={`tkt stock-${pattern} ${className}`} style={style}>
      <div className="tk-body">
        <div className="tk-kicker">{kicker}</div>
        <div className="tk-name" style={{ marginTop: 6 }}>
          {name}
        </div>
        {perks ? <div className="tk-perks">{perks}</div> : null}
        {children}
      </div>
      <div className="tk-stub">
        <div className="tk-price">{price}</div>
        {priceNote ? <div className={`tk-kicker ${priceNoteHot ? "hot" : ""}`}>{priceNote}</div> : null}
        {serial ? <div className="tk-serial">{serial}</div> : null}
      </div>
      {stamp ? (
        <div className="stamp" style={{ right: 18, top: "38%" }}>
          {stamp}
        </div>
      ) : null}
    </div>
  );
}
