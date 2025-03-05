export const defaultFilterConfig = {
  filters: {
    enemyLevel: {
      options: ["普通", "精英", "领袖"],
      title: "地位",
    },
    enemyRace: {
      options: [
        "感染生物",
        "无人机",
        "萨卡兹",
        "宿主",
        "海怪",
        "法术造物",
        "化物",
        "机械",
        "野生动物",
        "坍缩体",
        "其他"
      ],
      title: "种类",
    },
    attackType: {
      options: ["近战", "远程", "不攻击"],
      title: "攻击方式",
    },
    damageType: {
      options: ["物理", "法术", "治疗", "无"],
      title: "伤害类型",
    },
    endure: {
      options: ["SS", "S+", "S", "A+", "A", "B+", "B", "C", "D", "E"],
      title: "生命值",
    },
    attack: {
      options: ["SS", "S+", "S", "A+", "A", "B+", "B", "C", "D", "E"],
      title: "攻击力",
    },
    defence: {
      options: ["SS", "S+", "S", "A+", "A", "B+", "B", "C", "D", "E"],
      title: "防御力",
    },
    moveSpeed: {
      options: ["SS", "S+", "S", "A+", "A", "B+", "B", "C", "D", "E"],
      title: "移动速度",
    },
    attackSpeed: {
      options: ["SS", "S+", "S", "A+", "A", "B+", "B", "C", "D", "E"],
      title: "攻击速度",
    },
    resistance: {
      options: ["SS", "S+", "S", "A+", "A", "B+", "B", "C", "D", "E"],
      title: "法术抗性",
    },
  },
  groups: [
    {
      title: "筛选",
      filters: ["enemyLevel", "enemyRace", "attackType", "damageType"],
      show: true,
    },
    {
      title: "六维筛选",
      filters: [
        "endure",
        "attack",
        "defence",
        "moveSpeed",
        "attackSpeed",
        "resistance",
      ],
      show: false,
    },
  ],
  states: {
    enemyLevel: [],
    enemyRace: [],
    attackType: [],
    damageType: [],
    endure: [],
    attack: [],
    defence: [],
    moveSpeed: [],
    attackSpeed: [],
    resistance: [],
  },
};
