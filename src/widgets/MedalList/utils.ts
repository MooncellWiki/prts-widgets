import type { MedalMetaData } from "./types";

export async function getMedalMetaData(): Promise<MedalMetaData> {
  const resp = await fetch(
    `/index.php?${new URLSearchParams({
      title: import.meta.env.PROD ? "光荣之路/data" : "光荣之路/devdata",
      action: "raw",
    })}`,
  );
  return await resp.json();
}
