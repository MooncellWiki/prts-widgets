import MD5 from 'md5'
export const apiEndPoint = 'https://api.prts.wiki'
export const domain = 'https://prts.wiki'
export function getImagePath(filename: string) {
  const md5 = MD5(filename)
  return `${md5.slice(0, 1)}/${md5.slice(0, 2)}/${filename}`
}

export const professionMap = {
  PIONEER: '先锋',
  WARRIOR: '近卫',
  SNIPER: '狙击',
  SUPPORT: '辅助',
  CASTER: '术师',
  SPECIAL: '特种',
  MEDIC: '医疗',
  TANK: '重装',
}
export function sum(arr: Array<number>) {
  return arr.reduce((acc, cur) => acc + cur, 0)
}
export function isMobile(): boolean {
  if (
    window.navigator.userAgent.match(
      /(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i,
    )
  ) {
    return true // 移动端
  } else {
    return false // PC端
  }
}
export function isFirefox(): boolean {
  return window.navigator.userAgent.indexOf('Firefox') !== -1
}
// export function rgba2str(color:Color){
//   return `#${color.r.toString(16)}${color.g.toString(16)}${color.b.toString(16)}${color.a.toString(16)}`
// }
export function downloadBlob(b: Blob, filename: string): void {
  const url = URL.createObjectURL(b)
  const ele = window.document.createElement('a')
  ele.href = url
  ele.download = filename + '.webm'
  ele.click()
}
