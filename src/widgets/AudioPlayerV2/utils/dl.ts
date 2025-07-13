import Crunker from "crunker";

export function combineAndDownload(url1: string, url2: string) {
  const crunker = new Crunker();

  crunker
    .fetchAudio(url1, url2)
    .then((buffers) => {
      return crunker.concatAudio(buffers);
    })
    .then((merged) => {
      return crunker.export(merged, `audio/${url1.split(".").pop()}`);
    })
    .then((output) => {
      crunker.download(
        output.blob,
        url1.split("/").pop()?.split(".")[0].replace("_intro", "") ||
          "combined_audio.mp3",
      );
      console.log(output.url);
    })
    .catch((error) => {
      console.error("Audio combination failed:", error);
    });
}

export function downloadFile(name: string, src: string) {
  const ele = document.createElement("a");
  ele.setAttribute("href", src);
  ele.setAttribute("download", name);
  ele.click();
}
