import { ref } from 'vue'
import { defineStore } from 'pinia'

interface Char {
  name: string
  type: string
  subtype: string
  rarity: string | number
  id: number
}
export const useCharStore = defineStore('char', () => {
  const selectedChar = ref<Char[]>([])
  const addOrDeleteChar = (char: Char) => {
    !selectedChar.value.includes(char)
      ? selectedChar.value.push(char)
      : selectedChar.value.splice(selectedChar.value.indexOf(char), 1)
  }
  return {
    selectedChar,
    addOrDeleteChar,
  }
})
