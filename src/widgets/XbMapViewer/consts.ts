interface blockDefine {
  icon: string | null;
  img: string | null;
  desc: string;
}

interface xbConstData {
  blockmap: Record<string, blockDefine>;
}

async function getConstData(): Promise<xbConstData> {
  const resp = await fetch(
    `/index.php?${new URLSearchParams({
      title: "模板:XbMapViewer/const",
      action: "raw",
    })}`,
  );
  return await resp.json();
}

const receivedConst = await getConstData();

export const blockmap: Record<string, blockDefine> = receivedConst.blockmap;
