export function downloadFile(name: string, src: string) {
  const ele = document.createElement("a");
  ele.setAttribute("href", `${src}?filename=${encodeURIComponent(name)}`);
  ele.setAttribute("download", name);
  ele.setAttribute("target", "_blank");
  document.body.append(ele);
  ele.click();
  ele.remove();
}
