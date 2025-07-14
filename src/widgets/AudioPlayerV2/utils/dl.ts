export function downloadFile(name: string, src: string) {
  const ele = document.createElement("a");
  ele.setAttribute("href", src);
  ele.setAttribute("download", name);
  ele.click();
}
