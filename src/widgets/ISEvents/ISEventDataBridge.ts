import { reactive } from "vue";

export const DataBridge = reactive<{
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
