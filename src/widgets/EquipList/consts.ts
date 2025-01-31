import { getImagePath } from "@/utils/utils";

export const colorMap: Record<string, string> = {
  red: "#F44336",
  blue: "#2196F3",
  green: "#8bd41c",
  yellow: "#ffaa22",
  purple: "#880acc",
  grey: "#2f2f2f",
};

export const shadowColor: Record<string, string> = {
  red: "#ef4444",
  green: "#84cc16",
  yellow: "#f59e0b",
  blue: "#3b82f6",
  purple: "#7e22ce",
  grey: "#52525b",
};

export const statsStyleMap: Record<string, number> = {
  hp: 1,
  atk: 1,
  def: 1,
  res: 1,
  time: -1,
  cost: -1,
  block: 1,
  atkspd: 1,
};

export const rarityMap: Record<string, string> = {
  "3": "★4",
  "4": "★5",
  "5": "★6",
};

export const tagIconFavor = getImagePath("图标_模组需求_信赖.png");

export const tagIconOther = getImagePath("图标_模组需求_精英2等级.png");
