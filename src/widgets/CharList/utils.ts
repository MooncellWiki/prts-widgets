const getLast = (str: string) => {
  if (str.includes('→')) {
    const arr = str.split('→')
    return parseInt(arr[arr.length - 1])
  }
  else {
    return parseInt(str)
  }
}

export class Char {
  zh: string
  profession: string
  rarity: number
  logo: string
  birthPlace: string
  race: string[]
  en: string
  ja: string
  id: string
  hp: number
  atk: number
  def: number
  res: number
  reDeploy: string
  cost: number
  block: number
  interval: string
  sex: string
  position: string
  tag: string[]
  obtainMethod: string[]
  potential: { type: string; value: number }[]
  trust: number[]
  phy: string
  flex: string
  tolerance: string
  plan: string
  skill: string
  adapt: string
  sortId: number
  subProfession: string
  feature: string
  force: string[] = []
  constructor(ele: HTMLDivElement) {
    const d = ele.dataset
    this.zh = d.zh!
    this.profession = d.profession!
    this.rarity = parseInt(d.rarity!)
    this.logo = d.logo || ''
    this.birthPlace = d.birth_place || ''
    if (d.nation)
      this.force.push(d.nation)
    if (d.group)
      this.force.push(d.group)
    if (d.team)
      this.force.push(d.team)

    this.race = (d.race || '').split('/')
    this.en = d.en || ''
    this.ja = d.ja || ''
    this.id = d.id || ''
    this.hp = parseInt(d.hp!)
    this.atk = parseInt(d.atk!)
    this.def = parseInt(d.def!)
    this.res = parseInt(d.res!)
    this.reDeploy = d.re_deploy!
    this.cost = getLast(d.cost!)
    this.block = getLast(d.block!)
    this.interval = d.interval!
    this.sex = d.sex!
    this.position = d.position!
    this.tag = d.tag?.split(' ') || []
    this.obtainMethod = d.obtain_method?.split(', ') || []

    this.potential = []
    const [types, values] = d.potential?.split('`')
      .map(v => v.split(',')) || []
    if (types && values) {
      types.forEach((t, i) => {
        this.potential.push({ type: t, value: parseInt(values[i]) })
      })
    }
    this.trust = d.trust?.split(',').map(v => v ? parseInt(v) : 0) || []
    this.phy = d.phy || ''
    this.flex = d.flex || ''
    this.tolerance = d.tolerance || ''
    this.plan = d.plan || ''
    this.skill = d.skill || ''
    this.adapt = d.adapt || ''
    this.sortId = parseInt(d.sortid!)
    this.subProfession = d.subprofession!
    this.feature = ele.innerHTML || ''
  }
}
export type CheckboxOption = string | { label: string; value: string[] }
export interface Filter {
  title: string
  cbt: CheckboxOption[]
  both: boolean
  field: string
}
export interface FilterGroup {
  title: string
  filter: Filter[]
}
