export type ManifestTicket = {
  id: string;
  holderName: string;
  typeName: string;
  admits: number;
  serial: string;
  phoneLast4: string;
  checkedInAt: string | null;
  checkedInBy: string | null;
};

export type ScanTicket = { id: string; holderName: string; typeName: string; admits: number; serial: string };

export type ScanResultPayload =
  | { result: "OK"; ticket: ScanTicket; checkedInAt: string; clientScanId: string }
  | { result: "DUPLICATE"; ticket: ScanTicket; checkedInAt: string; checkedInBy: string; clientScanId: string }
  | { result: "INVALID"; reason: string; clientScanId: string };

export type QueuedScan = { clientScanId: string; code?: string; ticketId?: string; scannedAt: string };
