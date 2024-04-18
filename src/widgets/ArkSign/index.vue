<script setup lang="ts">
import { type VNodeChild, h, nextTick, ref, watch } from "vue";

import {
  HelpOutlineOutlined,
  KeyboardArrowDownFilled,
  KeyboardArrowUpFilled,
} from "@vicons/material";
import html2canvas from "html2canvas";
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NCollapse,
  NCollapseItem,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NIcon,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  useMessage,
} from "naive-ui";
import { VueDraggable } from "vue-draggable-plus";

import { STATIC_ENDPOINT } from "@/utils/consts";
import { isMobileSkin } from "@/utils/utils";

import Label from "./Label.vue";
import howToGetSklandToken from "./Skland.vue";
import {
  charAvatar,
  docAvatar,
  elite,
  equip,
  portrait,
  potential,
  profession,
  server,
  skill,
  specialized,
  starWhite,
  starYellow,
} from "./getUrl";
import { filterProfessionList, filterRarityList, sortList } from "./option";
import { getPlayerBinding, getPlayerInfo } from "./skland";
import type { BindingListItem, Char, PlayerInfo } from "./types";

const isMobile = isMobileSkin();
const doctorInfo = ref<{
  nickName: string;
  level: number;
  avatar: PlayerInfo["status"]["avatar"];
  server: string;
}>({
  nickName: "doctor",
  level: 120,
  avatar: {
    id: "avatar_def_08",
    type: "ICON",
  },
  server: "1",
});
const drawerShow = ref(false);
const modalShow = ref(false);
const showImgResult = ref(false);
const showImgResultM = ref(false);
const message = useMessage();
const selectFilterProfession = ref("all");
const selectFilterRarity = ref("all");
const sortOrder = ref(false);
const selectSort = ref("level");
const customSign = ref("签名内容，建议不超过两行");
const imgScale = ref(1);
const credStr = ref(""); //森空岛凭据input
const bindingList = ref<BindingListItem[]>([]); //绑定列表
const selectUid = ref<string>(); //默认uid
const charData = ref<Record<string, Char>>({});
const selected = ref<string[]>([]); //选中的干员列表
const charInfoMap = ref<PlayerInfo["charInfoMap"]>({}); //干员信息map
const equipmentInfoMap = ref<PlayerInfo["equipmentInfoMap"]>({}); //模组map
const charSignInner = ref<HTMLElement>();
const resultImgUrl = ref(""); //截图URL
const showInfo = ref({
  profession: true,
  rarity: true,
  equip: true,
  skill: true,
  level: true,
  potential: true,
  elite: true,
});
const charList = ref<Char[]>([]);
function order() {
  const selectedList: Char[] = [];
  let result: Char[] = [];
  for (const charId of Object.keys(charData.value)) {
    let index = selected.value.indexOf(charId);
    if (index !== -1) {
      selectedList[index] = charData.value[charId];
      continue;
    }
    if (
      selectFilterProfession.value != "all" &&
      charInfoMap.value[charId].profession != selectFilterProfession.value
    ) {
      continue;
    }
    if (
      selectFilterRarity.value === "3" &&
      charInfoMap.value[charId].rarity >= 3
    ) {
      continue;
    }
    if (
      selectFilterRarity.value != "all" &&
      charInfoMap.value[charId].rarity !==
        Number.parseInt(selectFilterRarity.value) - 1
    ) {
      continue;
    }
    result.push(charData.value[charId]);
  }
  if (selectSort.value == "level") {
    result.sort((a, b) => a.level - b.level);
  } else if (selectSort.value == "gainTime") {
    result.sort((a, b) => a.gainTime - b.gainTime);
  } else if (selectSort.value == "potentialRank") {
    result.sort((a, b) => a.potentialRank - b.potentialRank);
  } else if (selectSort.value == "favorPercent") {
    result.sort((a, b) => a.favorPercent - b.favorPercent);
  }
  if (sortOrder.value) {
    result.reverse();
  }
  charList.value = selectedList.concat(result);
}
watch(
  () => [
    charData.value,
    selectFilterProfession.value,
    selectFilterRarity.value,
    sortOrder.value,
    selectSort.value,
  ],
  order,
);
const drag = ref(false);
const disabled = ref(false);
const onStart = () => {
  drag.value = true;
};
function onEnd() {
  nextTick(() => {
    drag.value = false;
  });
}

//获取Cred
function getCredAndSecret(text: string) {
  if (!text.includes(",")) {
    console.log("错误");
    throw new Error("可能输入格式不正确，应是一个中间包含逗号的一串字母");
  }
  text = text.replaceAll(/\s+/g, "").replaceAll(/["']/g, "");
  const textArr = text.split(",");
  const cred = textArr[0];
  const secret = textArr[1];
  return { cred, secret };
}
async function importSKLandOperatorData() {
  try {
    const { cred, secret } = getCredAndSecret(credStr.value);
    if (cred == undefined || secret == undefined) {
      console.log("出错了");
      return false;
    }
    //获取绑定信息
    const playerBinding = await getPlayerBinding("", secret, cred);

    bindingList.value = playerBinding.bindingList;
    selectUid.value = playerBinding.uid;
    doctorInfo.value.server = playerBinding.server;

    const playerInfo = await getPlayerInfo(
      `uid=${playerBinding.uid}`,
      secret,
      cred,
      playerBinding.uid,
    );
    //清空已选的干员
    selected.value = [];
    charData.value = {};
    for (const char of playerInfo.chars) {
      charData.value[char.charId] = char;
    }
    charInfoMap.value = playerInfo.charInfoMap;
    equipmentInfoMap.value = playerInfo.equipmentInfoMap;
    doctorInfo.value.nickName = playerInfo.nickName;
    doctorInfo.value.avatar = playerInfo.avatar;
    doctorInfo.value.level = playerInfo.level;
    clearSelected();
    console.log(playerInfo);
  } catch (error: any) {
    message.error(error.message);
  }
}
async function importSKLandOperatorDataByUid(uid: string) {
  try {
    const { cred, secret } = getCredAndSecret(credStr.value);
    const playerInfo = await getPlayerInfo(`uid=${uid}`, secret, cred, uid);
    //清空已选的干员
    selected.value = [];
    charData.value = {};
    for (const char of playerInfo.chars) {
      charData.value[char.charId] = char;
    }
    charInfoMap.value = playerInfo.charInfoMap;
    equipmentInfoMap.value = playerInfo.equipmentInfoMap;
    doctorInfo.value.nickName = playerInfo.nickName;
    doctorInfo.value.avatar = playerInfo.avatar;
    doctorInfo.value.level = playerInfo.level;
    clearSelected();
  } catch (error: any) {
    message.error(error.message);
  }
}
function handleChangeUid(value: string, option: BindingListItem) {
  doctorInfo.value.server = option.channelMasterId;
  importSKLandOperatorDataByUid(value);
}

function renderLabel(option: BindingListItem): VNodeChild {
  let typeColor = {};
  if (option.channelMasterId == "1") {
    typeColor = {
      color: "#ecffe3",
      borderColor: "#66ccff",
      textColor: "#23c21a",
    };
  } else if (option.channelMasterId == "2") {
    typeColor = {
      color: "#ffe7f4",
      borderColor: "#66ccff",
      textColor: "#ff69b4",
    };
  }
  return h(Label, {
    typeColor,
    nickName: option.nickName,
    channelName: option.channelName,
  });
}
function selectChar(charId: string) {
  const index = selected.value.indexOf(charId);
  if (index === -1) {
    selected.value.push(charId);
  } else {
    selected.value.splice(index, 1);
  }
}
function clearSelected() {
  selected.value = [];
  order();
}
//截图
function GenerateImg(type: string) {
  message.info("图片生成中，请不要关闭或滚动页面~");
  const shareContent = charSignInner.value!;
  const width = shareContent.offsetWidth;
  const height = shareContent.offsetHeight;
  const canvas = document.createElement("canvas");
  const scale = imgScale.value;

  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.getContext("2d")!.scale(scale, scale);
  const opts = {
    scale: 1,
    canvas: canvas,
    logging: true,
    allowTaint: true,
    useCORS: true,
    width: width,
    height: height,
  };
  html2canvas(shareContent, opts).then(function (canvas) {
    let imgData = canvas.toDataURL("PNG");
    if (type == "d") {
      showImgResult.value = true;
    } else if (type == "m") {
      showImgResultM.value = true;
    }
    resultImgUrl.value = imgData;
  });
}
function calcSkillRankShow(skills: Char["skills"], skillId: string) {
  let index = skills.findIndex((e) => e.id == skillId);
  let sp = skills[index].specializeLevel;
  return sp == 0 ? true : false;
}
function calcEquip(char: Char) {
  return char.defaultEquipId
    ? equip(equipmentInfoMap.value[char.defaultEquipId].typeIcon)
    : `${STATIC_ENDPOINT}/charinfo/img/skland/skill_icon_none.png`;
}
function calcEquipStyle(char: Char) {
  if (char.defaultEquipId) {
    return equipmentInfoMap.value[char.defaultEquipId].typeIcon == "original"
      ? "height:80%"
      : "transform:translateY(-4%);height:100%;";
  } else {
    return "height:100%";
  }
}
function calcAvatar(avatar: PlayerInfo["status"]["avatar"]) {
  if (avatar.id) {
    return avatar.type == "ICON" ? docAvatar(avatar.id) : charAvatar(avatar.id);
  } else {
    return docAvatar("avatar_def_01");
  }
}
function calcServerColor(id: string) {
  if (id === "1") {
    return { "background-color": "rgba(34, 187, 255, .7)" };
  }
  if (id === "2") {
    return { "background-color": "rgba(255, 129, 174, .7)" };
  }
}
</script>

<template>
  <div>
    <n-alert title="操作指南" type="info" style="margin-bottom: 1em" closable>
      {{
        selected.length > 0
          ? "选择干员后，可以拖拽立绘来进行排序"
          : "导入数据后，在下方干员列表选择喜爱的干员"
      }}
    </n-alert>
    <div class="charSign">
      <div ref="charSignInner" class="charSignInner">
        <div class="circlePoint">
          <img :src="`${STATIC_ENDPOINT}/charinfo/img/skland/rightPoint.png`" />
        </div>
        <div class="leftWrapper">
          <div class="logoBg">
            <img
              :src="`${STATIC_ENDPOINT}/charinfo/img/skland/Logo_rhodesBlack.png`"
            />
          </div>
          <div class="avatarWrapper">
            <div id="avatar" class="avatar">
              <img
                v-if="doctorInfo.avatar"
                :src="calcAvatar(doctorInfo.avatar)"
                width="100%"
              />
              <div class="doctorLevel">
                <div class="doctorLevelText">{{ doctorInfo.level }}</div>
              </div>
            </div>
          </div>
          <div class="codeNameWrapper">
            <div class="codeName">
              <div class="server" :style="calcServerColor(doctorInfo.server)">
                <img :src="server(doctorInfo.server)" width="100%" />
              </div>
              <div class="codeNameTextWrapper">
                <div class="codeNameTextInner">
                  {{ doctorInfo.nickName }}
                </div>
              </div>
            </div>
          </div>
          <div class="SignWrapper">
            <div class="SignText">
              {{ customSign }}
            </div>
          </div>
        </div>
        <div class="middleWrapper">
          <div class="middleInner"></div>
        </div>
        <div class="rightWrapper">
          <VueDraggable
            ref="el"
            v-model="selected"
            :disabled="disabled"
            :animation="200"
            ghost-class="ghost"
            easing="cubic-bezier(0.55, 0, 0.1, 1)"
            class="signContainer"
            target=".signContainer-inner"
            @start="onStart"
            @end="onEnd"
          >
            <TransitionGroup
              type="transition"
              tag="div"
              :name="!drag ? 'fade' : undefined"
              class="signContainer-inner"
            >
              <div
                v-for="charId in selected"
                :key="charId"
                class="charSignItem"
              >
                <img
                  class="charImg"
                  :src="portrait(charData[charId].skinId)"
                  alt=""
                />
                <div class="mask"></div>
                <div class="skillWrapper">
                  <div v-show="showInfo.equip" class="skillIcon">
                    <div class="equipBg">
                      <img
                        :src="`${STATIC_ENDPOINT}/charinfo/img/skland/skill_icon_empty.png`"
                        width="100%"
                      />
                    </div>
                    <div class="equipIcon">
                      <img
                        :src="calcEquip(charData[charId])"
                        :style="calcEquipStyle(charData[charId])"
                      />
                    </div>
                  </div>
                  <div v-show="showInfo.skill" class="skillIcon">
                    <template v-if="charData[charId].defaultSkillId">
                      <img
                        class="skillRank"
                        :src="
                          specialized(
                            charData[charId].skills,
                            charData[charId].defaultSkillId,
                          )
                        "
                        alt=""
                      />
                      <div
                        v-if="
                          calcSkillRankShow(
                            charData[charId].skills,
                            charData[charId].defaultSkillId,
                          )
                        "
                        class="skillRank"
                      >
                        {{ charData[charId].mainSkillLvl }}
                      </div>
                    </template>
                    <img
                      class="skillImg"
                      :src="skill(charData[charId].defaultSkillId)"
                      alt=""
                    />
                  </div>
                </div>
                <div class="bottomWrapper">
                  <div>
                    <img
                      v-show="showInfo.potential"
                      :src="potential(charData[charId].potentialRank)"
                      alt=""
                    />
                  </div>
                  <div>
                    <div v-show="showInfo.level" class="level">
                      <br />{{ charData[charId].level }}
                    </div>
                  </div>
                </div>
                <div class="eliteWrapper">
                  <div v-show="showInfo.elite" class="eliteInner">
                    <img
                      :src="elite(charData[charId].evolvePhase)"
                      width="100%"
                      height="auto"
                    />
                  </div>
                </div>
                <div class="topWrapper">
                  <img
                    v-show="showInfo.profession"
                    class="professionIcon"
                    :src="profession(charInfoMap[charId].profession)"
                  />
                  <img
                    v-show="showInfo.rarity"
                    class="rarityIcon"
                    :src="starWhite(charInfoMap[charId].rarity)"
                  />
                </div>
              </div>
            </TransitionGroup>
          </VueDraggable>
        </div>
      </div>
    </div>
    <n-card title="数据获取" class="nomobile">
      <div class="flex items-center flex-wrap">
        <div class="w-auto">森空岛凭证：</div>
        <div style="width: 300px">
          <n-input v-model:value="credStr" placeholder="请输入您的森空岛凭证" />
        </div>
        <n-button
          style="margin-left: 10px"
          type="primary"
          @click="importSKLandOperatorData"
        >
          导入数据
        </n-button>
        <n-button
          text
          type="primary"
          style="margin-left: 10px"
          @click="modalShow = true"
        >
          <template #icon>
            <n-icon>
              <HelpOutlineOutlined />
            </n-icon>
          </template>
          如何获取森空岛凭证
        </n-button>
      </div>
      <div class="flex items-center" style="margin-top: 15px">
        选择游戏角色：
        <div style="min-width: 200px; margin-left: 10px">
          <n-select
            v-model:value="selectUid"
            label-field="nickName"
            value-field="uid"
            :options="bindingList"
            :render-label="renderLabel"
            @update:value="handleChangeUid"
          />
        </div>
      </div>
      <div class="flex items-center flex-wrap" style="margin-top: 15px">
        <div style="margin-bottom: 5px">选择图片质量：</div>
        <div class="flex">
          <n-input-number
            v-model:value="imgScale"
            button-placement="both"
            :min="1"
            :max="5"
            style="margin-right: 10px"
          />
          <n-button type="primary" @click="GenerateImg('d')">生成图片</n-button>
        </div>
      </div>
    </n-card>
    <n-card v-if="isMobile" title="数据获取">
      <template #header-extra>
        <n-button text type="primary" @click="drawerShow = true">
          <template #icon>
            <n-icon>
              <HelpOutlineOutlined />
            </n-icon>
          </template>
          如何获取森空岛凭证
        </n-button>
      </template>
      <div class="flex items-center flex-wrap">
        <div class="w-full" style="margin-bottom: 5px">森空岛凭证：</div>
        <div class="w-full flex">
          <n-input
            v-model:value="credStr"
            class="flex-1"
            placeholder="请输入您的森空岛凭证"
          />
          <n-button
            style="margin-left: 10px"
            type="primary"
            @click="importSKLandOperatorData"
            >导入数据</n-button
          >
        </div>
      </div>
      <div class="flex items-center flex-wrap" style="margin-top: 15px">
        <div class="w-full" style="margin-bottom: 5px">选择游戏角色：</div>
        <div class="w-full">
          <n-select
            v-model:value="selectUid"
            label-field="nickName"
            value-field="uid"
            :options="bindingList"
            :render-label="renderLabel"
            @update:value="handleChangeUid"
          />
        </div>
      </div>
      <div class="flex items-center flex-wrap" style="margin-top: 15px">
        <div class="w-full" style="margin-bottom: 5px">选择图片质量：</div>
        <div class="flex">
          <n-input-number
            v-model:value="imgScale"
            button-placement="both"
            :min="1"
            :max="5"
            style="margin-right: 10px"
          />
          <n-button type="primary" @click="GenerateImg('m')">生成图片</n-button>
        </div>
      </div>
    </n-card>
    <n-card title="信息展示" style="margin-top: 10px">
      <n-collapse :default-expanded-names="['1']">
        <n-collapse-item title="自定义签名" name="1">
          <div class="flex w-full">
            <n-input
              v-model:value="customSign"
              placeholder="建议不要超过两行"
              style="margin-right: 10px"
            />
          </div>
        </n-collapse-item>
        <n-collapse-item title="自定义信息展示" name="2">
          <n-checkbox v-model:checked="showInfo.profession" />
          <span style="margin: 0 20px 0 5px">职业</span>
          <n-checkbox v-model:checked="showInfo.rarity" />
          <span style="margin: 0 20px 0 5px">星级</span>
          <n-checkbox v-model:checked="showInfo.elite" />
          <span style="margin: 0 20px 0 5px">精英</span>
          <n-checkbox v-model:checked="showInfo.potential" />
          <span style="margin: 0 20px 0 5px">潜能</span>
          <n-checkbox v-model:checked="showInfo.level" />
          <span style="margin: 0 20px 0 5px">等级</span>
          <n-checkbox v-model:checked="showInfo.equip" />
          <span style="margin: 0 20px 0 5px">模组</span>
          <n-checkbox v-model:checked="showInfo.skill" />
          <span style="margin: 0 20px 0 5px">技能</span>
        </n-collapse-item>
      </n-collapse>
    </n-card>
    <n-card title="干员列表" style="margin-top: 10px">
      <template #header-extra>
        <n-button
          v-if="selected.length > 0 && isMobile"
          style="margin-right: 10px"
          size="small"
          type="error"
          tertiary
          @click="clearSelected"
          >清空已选</n-button
        >
        <n-button
          v-if="charList.length > 0 && isMobile"
          secondary
          size="small"
          style="margin-right: 10px"
          @click="sortOrder = !sortOrder"
        >
          {{ sortOrder ? "倒序" : "正序" }}
          <n-icon size="20">
            <keyboard-arrow-down-filled v-if="!sortOrder" />
            <keyboard-arrow-up-filled v-else />
          </n-icon>
        </n-button>
      </template>
      <div
        v-if="charList.length > 0 && !isMobile"
        class="flex"
        style="margin-bottom: 10px"
      >
        <div style="width: 120px; margin-right: 10px">
          <n-select
            v-model:value="selectFilterProfession"
            :options="filterProfessionList"
          />
        </div>
        <div style="width: 120px; margin-right: 10px">
          <n-select
            v-model:value="selectFilterRarity"
            :options="filterRarityList"
          />
        </div>
        <div style="width: 110px; margin-right: 10px">
          <n-select v-model:value="selectSort" :options="sortList" />
        </div>
        <n-button
          style="margin-right: 10px"
          secondary
          @click="sortOrder = !sortOrder"
        >
          {{ sortOrder ? "倒序排序" : "顺序排序" }}
          <n-icon size="20">
            <keyboard-arrow-down-filled v-if="!sortOrder" />
            <keyboard-arrow-up-filled v-else />
          </n-icon>
        </n-button>
        <n-button
          v-if="selected.length > 0"
          type="error"
          tertiary
          @click="clearSelected"
          >清空已选</n-button
        >
      </div>
      <div
        v-if="charList.length > 0 && isMobile"
        class="flex flex-wrap justify-around"
        style="margin-bottom: 10px"
      >
        <div style="width: 30%">
          <n-select
            v-model:value="selectFilterProfession"
            size="small"
            :options="filterProfessionList"
          />
        </div>
        <div style="width: 30%">
          <n-select
            v-model:value="selectFilterRarity"
            size="small"
            :options="filterRarityList"
          />
        </div>
        <div style="width: 30%">
          <n-select
            v-model:value="selectSort"
            size="small"
            :options="sortList"
          />
        </div>
      </div>
      <n-empty v-if="charList.length === 0" description="NO INFO/"></n-empty>
      <div class="flex justify-center">
        <div class="charListWrapper">
          <div
            v-for="item in charList"
            :key="item.charId"
            class="charItem"
            @click="selectChar(item.charId)"
          >
            <img
              :key="item.skinId"
              class="lazyload charImg"
              :data-src="portrait(item.skinId)"
              alt=""
            />
            <div class="mask"></div>
            <div class="name">{{ charInfoMap[item.charId].name }}</div>
            <div class="bottomWrapper">
              <div class="level">{{ item.level }}</div>
              <img :src="potential(item.potentialRank)" alt="" />
            </div>
            <div class="eliteWrapper">
              <div class="eliteInner">
                <img
                  :src="elite(item.evolvePhase)"
                  width="100%"
                  height="auto"
                />
              </div>
            </div>
            <div class="topWrapper">
              <img
                class="professionIcon"
                :src="profession(charInfoMap[item.charId].profession)"
              />
              <img
                class="rarityIcon"
                :src="starYellow(charInfoMap[item.charId].rarity)"
              />
            </div>
            <div v-if="selected.includes(item.charId)" class="selectMask">
              {{ selected.indexOf(item.charId) + 1 }}
            </div>
          </div>
        </div>
      </div>
    </n-card>
  </div>
  <n-drawer v-model:show="drawerShow" class="w-full" default-width="100%">
    <n-drawer-content title="如何获取森空岛凭证" closable>
      <howToGetSklandToken />
    </n-drawer-content>
  </n-drawer>
  <n-drawer
    v-model:show="showImgResultM"
    style="height: 60%"
    :placement="'bottom'"
  >
    <n-drawer-content title="图片可长按保存" closable>
      <img :src="resultImgUrl" width="100%" />
    </n-drawer-content>
  </n-drawer>
  <n-modal
    v-model:show="modalShow"
    class="custom-card"
    preset="card"
    style="width: 40%; min-width: 750px"
    title="如何获取森空岛凭证"
    :bordered="false"
  >
    <howToGetSklandToken />
  </n-modal>
  <n-modal
    v-model:show="showImgResult"
    class="custom-card"
    preset="card"
    style="width: 60%; min-width: 600px"
    title="生成结果"
    :bordered="false"
  >
    <img :src="resultImgUrl" width="100%" />
  </n-modal>
</template>

<style lang="css" scoped>
img {
  max-width: initial;
  /*干掉移动前端 */
}

.ghost {
  opacity: 0.7;
  background: #c8ebfb;
  border: 3px solid #0c93d6;
  box-sizing: border-box;
}

.signContainer {
  max-width: inherit !important;
  display: flex;
  justify-content: start;
}

.signContainer-inner {
  display: flex;
  justify-content: start;
  flex-wrap: nowrap;
}

.item {
  width: 100px;
  height: 100px;
  background-color: #c8ebfb;
  margin: 5px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: move;
  border-radius: 10px;
}

.fade-move,
.fade-enter-active,
.fade-leave-active {
  transition: all 0.5s cubic-bezier(0.55, 0, 0.1, 1);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.01) translate(30px, 0);
  /* width: 0 !important; */
}

.fade-leave-active {
  position: absolute;
}

.inputToken {
  display: flex;
  justify-content: start;
  align-items: center;
  margin-top: 10px;
  flex-wrap: wrap;
}

.charListWrapper {
  display: flex;
  justify-content: center;
  max-width: 1500px;
  flex-wrap: wrap;
  --charSize: 10px;
  font-family: sans-serif;
  user-select: none;
}

.charItem {
  width: calc(var(--charSize) * 10);
  height: calc(var(--charSize) * 20);
  position: relative;
  margin: calc(var(--charSize) * 0.5);
  background-color: #313131;
}

.charSignItem {
  width: calc(var(--charSize) * 10);
  height: calc(var(--charSize) * 26.3);
  position: relative;
  margin: calc(var(--charSize) * 0.5);
  background-color: #313131;
}

.charItem .charImg {
  width: 100%;
}

.charSignItem .charImg {
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
}

.charItem .mask {
  width: 100%;
  height: 45%;
  z-index: 1;
  position: absolute;
  right: 0;
  bottom: 0;
  background-image: linear-gradient(
    to top,
    rgba(49, 49, 49, 1),
    rgba(49, 49, 49, 0)
  );
}

.charSignItem .mask {
  width: 100%;
  height: 40%;
  z-index: 1;
  position: absolute;
  right: 0;
  bottom: calc(var(--charSize) * 6);
  /* background-image: linear-gradient(to top, red 0%, blue 90%); */

  background-image: linear-gradient(
    to top,
    rgba(49, 49, 49, 1) 10%,
    rgba(49, 49, 49, 0) 90%
  );
  background-repeat: no-repeat;
  background-position: bottom;
  background-size: 110% 110%;
  /* background-origin: border-box; */
}

.charItem .name {
  width: 100%;
  height: calc(var(--charSize) * 2.2);
  display: flex;
  justify-content: end;
  align-items: center;
  z-index: 2;
  position: absolute;
  right: 0;
  bottom: 0;
  color: #ffffff;
  box-sizing: border-box;
  padding: 0 calc(var(--charSize) * 0.5);
  font-size: calc(var(--charSize) * 1.4);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.charItem .bottomWrapper {
  position: absolute;
  right: 0;
  bottom: calc(var(--charSize) * 2.2);
  z-index: 2;
  width: 100%;
  height: calc(var(--charSize) * 3);
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;
  padding: 0 calc(var(--charSize) * 0.6);
}

.charSignItem .bottomWrapper {
  position: absolute;
  right: 0;
  bottom: calc(var(--charSize) * 6.1);
  z-index: 2;
  width: 100%;
  height: calc(var(--charSize) * 3);
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;
  padding: 0 calc(var(--charSize) * 0.8);
}

.charItem .bottomWrapper .level {
  width: calc(var(--charSize) * 3);
  height: calc(var(--charSize) * 3);
  font-size: calc(var(--charSize) * 1.6);
  line-height: calc(var(--charSize) * 3);
  color: #ffffff;
  border-radius: 999px;
  background-color: #242424;
  text-align: center;
}

.charSignItem .bottomWrapper .level {
  width: calc(var(--charSize) * 3);
  height: calc(var(--charSize) * 3);
  font-size: calc(var(--charSize) * 1.4);
  line-height: calc(var(--charSize) * 1.4);
  color: #ffffff;
  border-radius: 999px;
  background-color: #242424;
  text-align: center;
}

.charSignItem .bottomWrapper .level::before {
  content: "LV";
  width: 100%;
  font-size: calc(var(--charSize) * 1);
  line-height: calc(var(--charSize) * 1);
  color: #ffffff;
  text-align: center;
}

.charItem .bottomWrapper img {
  width: calc(var(--charSize) * 2.8);
  height: calc(var(--charSize) * 2.8);
}

.charSignItem .bottomWrapper img {
  width: calc(var(--charSize) * 2.4);
  height: calc(var(--charSize) * 2.4);
}

.charItem .eliteWrapper {
  position: absolute;
  right: 0;
  bottom: calc(var(--charSize) * 4.2);
  z-index: 2;
  width: 100%;
  display: flex;
  justify-content: center;
  box-sizing: border-box;
}

.charSignItem .eliteWrapper {
  position: absolute;
  right: 0;
  bottom: calc(var(--charSize) * 8);
  z-index: 2;
  width: 100%;
  display: flex;
  justify-content: center;
  box-sizing: border-box;
}

.charItem .eliteWrapper .eliteInner {
  width: calc(var(--charSize) * 4);
}

.charSignItem .eliteWrapper .eliteInner {
  width: calc(var(--charSize) * 4.4);
}

.charItem .topWrapper {
  position: absolute;
  left: 0;
  top: calc(var(--charSize) * 0.5);
  z-index: 2;
  width: 100%;
  height: calc(var(--charSize) * 2);
  display: flex;
  justify-content: start;
  align-items: center;
  box-sizing: border-box;
  padding: 0 calc(var(--charSize) * 0.5);
}

.charSignItem .topWrapper {
  position: absolute;
  left: 0;
  top: calc(var(--charSize) * 0.5);
  z-index: 2;
  width: 100%;
  height: calc(var(--charSize) * 2);
  display: flex;
  justify-content: start;
  align-items: center;
  box-sizing: border-box;
  padding: 0 calc(var(--charSize) * 0.5);
}

.charItem .topWrapper .professionIcon {
  width: calc(var(--charSize) * 2);
  height: calc(var(--charSize) * 2);
}

.charSignItem .topWrapper .professionIcon {
  width: calc(var(--charSize) * 2);
  height: calc(var(--charSize) * 2);
}

.charItem .topWrapper .rarityIcon {
  width: auto;
  height: calc(var(--charSize) * 1.6);
}

.charSignItem .topWrapper .rarityIcon {
  width: auto;
  height: calc(var(--charSize) * 1.6);
}

.charSignItem .skillWrapper {
  position: absolute;
  bottom: calc(var(--charSize) * 1.5);
  right: 0;
  width: 100%;
  z-index: 2;
  height: calc(var(--charSize) * 4);
  display: flex;
  justify-content: center;
  align-items: center;
}

.charSignItem .skillWrapper .skillIcon .skillImg {
  width: calc(var(--charSize) * 4);
  height: calc(var(--charSize) * 4);
}

.charSignItem .skillIcon .equipBg {
  width: 100%;
  height: 100%;
}

.charSignItem .skillIcon .equipIcon {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

.charSignItem .skillWrapper .skillIcon {
  width: calc(var(--charSize) * 4);
  height: calc(var(--charSize) * 4);
  position: relative;
  margin: 0 calc(var(--charSize) * 0.3);
  /* box-shadow: 0 5px 5px rgba(0,0,0,.3); */
  /* font-size:0; */
}

.charSignItem .skillWrapper .skillIcon .skillRank {
  position: absolute;
  top: 0;
  left: 0;
  background-color: #000;
  width: calc(var(--charSize) * 1);
  height: calc(var(--charSize) * 1);
  color: #ffffff;
  font-size: calc(var(--charSize) * 1);
  line-height: calc(var(--charSize) * 1);
  display: flex;
  justify-content: center;
  align-items: center;
}

.charItem .selectMask {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 3px solid #22bbff;
  position: absolute;
  top: 0;
  left: 0;
  background-color: rgba(34, 187, 255, 0.3);
  z-index: 3;
  color: #ffffff;
  font-size: calc(var(--charSize) * 5);
  line-height: calc(var(--charSize) * 5);
  text-align: right;
  padding: calc(var(--charSize) * 0.5);
  text-shadow: 0 0 calc(var(--charSize) * 1) rgba(0, 0, 0, 0.8);
}

.charSign {
  width: 100%;
  --charSize: 10px;
  display: flex;
  margin-bottom: 10px;
  overflow-x: scroll;
  overflow-y: hidden;
  padding-bottom: 10px;
}

.charSign::-webkit-scrollbar {
  height: 15px;
  background-color: rgba(0, 0, 0, 0.2);
  border: 2px solid #fff;
  border-radius: 5px;
}

.charSign::-webkit-scrollbar-thumb {
  border-radius: 5px;
  background-color: #ffffff;
  border: 2px solid rgba(0, 0, 0, 0.2);
}

.charSignInner {
  width: auto;
  height: calc(var(--charSize) * 30);
  background-image: linear-gradient(to right, #313131, #1d1d1d 50%);
  display: flex;
  justify-content: center;
  margin: auto;
  position: relative;
}

.leftWrapper {
  width: calc(var(--charSize) * 30);
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.middleWrapper {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
}

.middleInner {
  height: 80%;
  width: calc(var(--charSize) * 0.5);
  background-color: #181818;
}

.logoBg {
  position: absolute;
  z-index: 0;
  top: calc(var(--charSize) * -9);
  left: calc(var(--charSize) * -18);
}

.logoBg img {
  width: calc(var(--charSize) * 40);
  opacity: 0.1;
}

.avatarWrapper {
  z-index: 1;
  width: 100%;
  height: calc(var(--charSize) * 13);
  /* background-color: rgba(255, 255, 255, .5); */
  display: flex;
  justify-content: center;
  margin-top: calc(var(--charSize) * 4);
}

.avatar {
  width: calc(var(--charSize) * 13);
  height: calc(var(--charSize) * 13);
  border: 1px solid #f5f5f5;
  box-sizing: border-box;
  background-color: rgba(255, 255, 255, 0.1);
  position: relative;
}

.doctorLevel {
  position: absolute;
  top: 0;
  left: 0;
  transform: translate(-50%, -50%);
  background-color: #313131;
  width: calc(var(--charSize) * 4);
  height: calc(var(--charSize) * 4);
  border: 2px solid #f0bc02;
  border-radius: 999px;
  display: flex;
  justify-content: center;
}

.doctorLevelText {
  font-size: calc(var(--charSize) * 2);
  color: #f5f5f5;
  transform: translateY(-5%);
}

.doctorLevel::after {
  content: "LV";
  font-size: calc(var(--charSize) * 1);
  color: #f5f5f5;
  position: absolute;
  bottom: 0;
  left: 0;
  text-align: center;
  width: 100%;
}

.codeNameWrapper {
  z-index: 1;
  width: 100%;
  display: flex;
  justify-content: center;
  height: calc(var(--charSize) * 3);
  margin-top: calc(var(--charSize) * 2);
}

.codeName {
  /* border: 1px solid #f5f5f5; */
  display: flex;
  justify-content: start;
  align-items: center;
  --borderColor: rgba(255, 255, 255, 0.8);
}

.server {
  width: calc(var(--charSize) * 3);
  height: calc(var(--charSize) * 3);
  border: 1px solid var(--borderColor);
  box-sizing: border-box;
  font-size: 0;
}

.codeNameTextWrapper {
  height: calc(var(--charSize) * 3);
  background-image: linear-gradient(
    to right,
    var(--borderColor) 20%,
    transparent 80%
  );
  background-repeat: no-repeat;
  background-position: left;
  background-size: 110% 110%;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
}

.codeNameTextInner {
  width: 100%;
  height: calc(100% - 2px);
  background-image: linear-gradient(to right, #262626 20%, #292929 80%);
  background-repeat: no-repeat;
  background-position: left;
  background-size: 110% 110%;
  padding: 0 calc(var(--charSize) * 1);
  color: #f5f5f5;
  font-size: calc(var(--charSize) * 1.6);
  line-height: calc(var(--charSize) * 3 - 2px);
  box-sizing: border-box;
  white-space: nowrap;
}

.SignWrapper {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-top: calc(var(--charSize) * 1.5);
}

.SignText {
  max-width: 90%;
  background-color: rgba(255, 255, 255, 0.2);
  padding: calc(var(--charSize) * 0.8) calc(var(--charSize) * 1.5);
  border-radius: calc(var(--charSize) * 0.5);
  color: #f5f5f5;
  font-size: calc(var(--charSize) * 1.2);
  box-sizing: border-box;
}

.rightWrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 calc(var(--charSize) * 2) 0 calc(var(--charSize) * 1.5);
}
.circlePoint {
  position: absolute;
  top: 0;
  right: 0;
}
.circlePoint img {
  height: calc(var(--charSize) * 30);
  width: calc(var(--charSize) * 30);
}
:deep(.n-card-header__main) {
  border-left: 5px solid var(--n-color-target);
  box-sizing: border-box;
  padding-left: 5px;
  font-weight: bold !important;
}

:deep(.n-card-header) {
  padding: 15px;
}

:deep(.n-card-content) {
  padding: 0 5px 15px 5px;
}
:deep(.n-input-number .n-input__input-el) {
  text-align: center;
}
@media screen and (max-width: 600px) {
  /* 当屏幕小于或等于 600px 时应用样式 */
  .charListWrapper {
    --charSize: 6px;
  }

  .charSign {
    --charSize: 6px;
  }
}
</style>
