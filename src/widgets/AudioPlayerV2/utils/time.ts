function divmod(num: number, div: number): [number, number] {
  return [Math.floor(num / div), Math.floor(num % div)];
}

function pad2(str: number): string {
  return str.toString().padStart(2, "0");
}

export function sec2str(len: number): string {
  if (len <= 0) {
    return "00:00";
  }
  const [m, s] = divmod(Math.floor(len), 60);
  return `${pad2(m)}:${pad2(s)}`;
}
