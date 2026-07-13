import { reactive } from "vue";

export const floorSortStore = reactive<{
  floorSort: {
    floorList: string[];
    curFloorTab: number;
    eventFloorList: Record<string, string[]>;
  };
}>({
  floorSort: {
    floorList: [],
    curFloorTab: 0,
    eventFloorList: {},
  },
});
