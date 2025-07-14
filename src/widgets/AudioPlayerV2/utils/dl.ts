import saveAs from "file-saver";
import JSZip from "jszip";

export async function combineAndDownload(url1: string, url2: string) {
  try {
    const zip = new JSZip();

    const getFilename = (url: string): string =>
      url.slice(Math.max(0, url.lastIndexOf("/") + 1)) || "file1";
    const zipFilename = getFilename(url1).replace("_intro", "");

    const addFileToZip = async (url: string, filename?: string) => {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Download failed: ${response.statusText}`);
      const blob = await response.blob();
      zip.file(filename || getFilename(url), blob);
    };

    await Promise.all([
      addFileToZip(url1, getFilename(url1)),
      addFileToZip(url2, getFilename(url2)),
    ]);

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${zipFilename}.zip`);
  } catch (error) {
    console.error("Error occurred:", error);
  }
}

export function downloadFile(name: string, src: string) {
  const ele = document.createElement("a");
  ele.setAttribute("href", src);
  ele.setAttribute("download", name);
  ele.click();
}
