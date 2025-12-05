import fetch from "node-fetch";
import path from "path";
import { supabase } from "../../supabase/supabase.init";
import { GroupConfig, SelectedItem } from "./types";
import { writeLog } from "./templateHandler";

async function loadContentFromPath(group: GroupConfig): Promise<unknown[]> {
  if (group.contentPath.startsWith("http")) {
    throw new Error(
      "Content path is a URL. Configure CONTENT_TABLE_<GROUP> to use Supabase SDK and avoid HTTP URLs."
    );
  }
  const importPath = path.resolve(process.cwd(), group.contentPath);
  const mod = await import(importPath);
  const ideas = (mod.ideas ?? mod.default) as unknown;
  if (Array.isArray(ideas)) return ideas as unknown[];
  throw new Error("Module does not export an array");
}

function normalizeItem(item: unknown): SelectedItem {
  if (typeof item === "string") {
    return { title: item, contentText: item, raw: item };
  }
  if (typeof item === "object" && item !== null) {
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title : undefined;
    let contentText: string | undefined;
    if (typeof obj.content === "string") {
      try {
        const parsed = JSON.parse(obj.content) as unknown;
        if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as any).contentElements)) {
          const elements = (parsed as any).contentElements as unknown[];
          const parts: string[] = [];
          for (const el of elements) {
            const e = el as Record<string, unknown>;
            if (e.type === "paragraph" && Array.isArray(e.content)) {
              const texts = (e.content as unknown[])
                .map((c) => (typeof (c as any).text === "string" ? (c as any).text : ""))
                .filter((s) => s.length > 0);
              parts.push(texts.join(""));
            }
          }
          contentText = parts.filter((s) => s.length > 0).join("\n");
        }
      } catch {
        contentText = undefined;
      }
    }
    const id = typeof obj.id === "string" || typeof obj.id === "number" ? (obj.id as string | number) : undefined;
    return { id, title, contentText, raw: item };
  }
  return { raw: item };
}

export function itemToPrompt(item: SelectedItem): string {
  const title = item.title ?? "Untitled";
  const body = item.contentText ?? "";
  return `Title: ${title}\n\nContext: ${body}`;
}

function getItemsPerPage(): number {
  const val = process.env.ITEMS_PER_PAGE || process.env.ITEMS_PER_PAG || "10";
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

async function fetchRandomFromSupabase(table: string, itemsPerPage: number): Promise<SelectedItem> {
  const countResp = await supabase.from(table).select("*", { count: "exact", head: true });
  if (countResp.error) throw new Error(`Supabase count error: ${countResp.error.message}`);
  const count = countResp.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / itemsPerPage));
  writeLog(`Supabase table '${table}' count=${count}`);
  writeLog(`Items per page=${itemsPerPage}`);
  writeLog(`Total pages=${totalPages}`);
  const randomPageIndex = Math.floor(Math.random() * totalPages);
  const from = randomPageIndex * itemsPerPage;
  const to = Math.max(from, from + itemsPerPage - 1);
  writeLog(`Fetching page index=${randomPageIndex}, range [${from}, ${to}]`);
  const { data, error } = await supabase.from(table).select("*").range(from, to);
  if (error) throw new Error(`Supabase data error: ${error.message}`);
  const arr = (data ?? []) as unknown[];
  if (arr.length === 0) throw new Error("Supabase returned empty page");
  const item = arr[Math.floor(Math.random() * arr.length)];
  
  // Log selected item details
  const itemId = (item as any).id ?? "unknown";
  const itemTitle = (item as any).title ?? "Untitled";
  writeLog(`Selected Supabase Item - ID: ${itemId}, Title: "${itemTitle}"`);
  
  return normalizeItem(item);
}

export async function getSelectedItem(group: GroupConfig): Promise<SelectedItem> {
  const tableEnvKey = `CONTENT_TABLE_${group.name}`;
  const table = process.env[tableEnvKey];
  const itemsPerPage = getItemsPerPage();
  if (table) {
    return fetchRandomFromSupabase(table, itemsPerPage);
  }
  const list = await loadContentFromPath(group);
  const idx = Math.floor(Math.random() * list.length);
  return normalizeItem(list[idx]);
}
