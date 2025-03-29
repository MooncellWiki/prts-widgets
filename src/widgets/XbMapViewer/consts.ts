export interface BlockDefine {
  icon: string | null;
  img: string | null;
  desc: string;
}

export interface XbConstData {
  blockmap: Record<string, BlockDefine>;
}

export async function getConstData(): Promise<XbConstData> {
  const resp = await fetch(
    `/index.php?${new URLSearchParams({
      title: "模板:XbMapViewer/const",
      action: "raw",
    })}`,
  );
  return await resp.json();
}
