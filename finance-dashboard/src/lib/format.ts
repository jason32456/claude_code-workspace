export function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n ?? 0);
}

export function percent(fraction: number): string {
  if (!isFinite(fraction)) return "∞";
  return `${Math.round(fraction * 100)}%`;
}

export function shortDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function inputDate(d: string | Date): string {
  const date = new Date(d);
  return date.toISOString().slice(0, 10);
}
