<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";

import { NConfigProvider, NTabPane, NTabs, NTooltip } from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";

import ContractIcon from "./components/ContractIcon.vue";
import ItemIcon from "./components/ItemIcon.vue";
import LadderSteps from "./components/LadderSteps.vue";
import PoolCountdown from "./components/PoolCountdown.vue";
import PriceTag from "./components/PriceTag.vue";
import ShopCard from "./components/ShopCard.vue";
import SkinAvatar from "./components/SkinAvatar.vue";
import {
  getCharInfo,
  getHighShop,
  getKernelSelectCount,
  getSkinGallery,
} from "./data";
import {
  buildHighShopView,
  formatCstTime,
  isKernelSelectGood,
  kernelSelectIconName,
  wikiImage,
  wikiItemName,
  wikiLink,
  type HighShopView,
} from "./utils";

import type { CharInfo, HighGood, SkinGalleryEntry } from "./types";

// 卡片图标区底色，同原 模板:高级凭证区商品一览
const STANDARD_BG = "linear-gradient(135deg, #ffc107, #0000 70%)";
const KERNEL_BG = "linear-gradient(135deg, #095c85, #0000 70%)";
const KERNEL_SELECT_BG = "linear-gradient(135deg, #019bdb, #0af9ff 70%)";

const i18nConfig = getNaiveUILocale();
const { theme, themeOverrides, isDark } = useTheme();

const view = shallowRef<HighShopView>();
const chars = shallowRef(new Map<string, CharInfo>());
const gallery = shallowRef(new Map<string, SkinGalleryEntry>());
const kernelSelectCount = ref<number | null>(null);
const updatedAt = ref<Date | null>(null);
const error = ref("");
const expanded = ref(false);

onMounted(async () => {
  try {
    const shop = await getHighShop();
    const shopView = buildHighShopView(shop.data);
    view.value = shopView;
    updatedAt.value = shop.updatedAt;

    // 以下只影响头像稀有度和甄选人数，失败时保留兜底显示
    const charIds = [
      ...[...shopView.standard, ...shopView.kernel]
        .filter((good) => !isKernelSelectGood(good))
        .map((good) => good.item!.id),
      ...shopView.reeditionOperators.map((ladder) => ladder.steps[0].item.id),
    ];
    getCharInfo(charIds)
      .then((result) => (chars.value = result))
      .catch((error_: unknown) => console.error("[HighShop]", error_));
    if (shopView.kernelSelect) {
      getKernelSelectCount(new Date())
        .then((count) => (kernelSelectCount.value = count))
        .catch((error_: unknown) => console.error("[HighShop]", error_));
    }
  } catch (error_) {
    console.error("[HighShop]", error_);
    error.value = error_ instanceof Error ? error_.message : String(error_);
  }
});

// 往期时装的头像要查 模板:时装回廊，默认折叠，展开时再拉
watch(expanded, (value) => {
  if (!value || gallery.value.size > 0) return;
  getSkinGallery()
    .then((result) => (gallery.value = result))
    .catch((error_: unknown) => console.error("[HighShop]", error_));
});

function contractOf(charId: string, fallbackName: string, price: number) {
  const info = chars.value.get(charId);
  return {
    name: info?.name ?? fallbackName,
    rarity: info?.rarity ?? (price >= 100 ? 5 : 4),
  };
}

function goodContract(good: HighGood) {
  return contractOf(good.item!.id, good.displayName ?? "", good.price);
}

// 每名危机合约干员的阶梯总价，全部相同时才显示「N/干员」
const reeditionPerOperator = computed(() => {
  const totals = new Set(view.value?.reeditionOperators.map((l) => l.total));
  return totals.size === 1 ? [...totals][0] : null;
});

const reeditionSkinCards = computed(() =>
  (view.value?.reeditionSkins ?? []).map((good) => ({
    good,
    entry: gallery.value.get((good.displayName ?? "").trim()),
  })),
);

const hasReedition = computed(
  () =>
    !!view.value &&
    (view.value.reeditionOperators.length > 0 ||
      view.value.reeditionSkins.length > 0),
);
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    inline-theme-disabled
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="i18nConfig.locale"
    :date-locale="i18nConfig.dateLocale"
  >
    <div class="high-shop" :class="{ 'prts-widget-dark': isDark }">
      <div v-if="error" class="high-shop-status">
        高级凭证区数据加载失败：{{ error }}
      </div>
      <div v-else-if="!view" class="high-shop-status">正在加载高级凭证区…</div>
      <template v-else>
        <table class="wikitable high-shop-table">
          <tbody>
            <tr>
              <td class="high-shop-banner">高级凭证区</td>
            </tr>
            <tr>
              <th>干员合同</th>
            </tr>
            <tr v-if="view.kernelSelect">
              <td class="kernel-select-bar">
                <i class="mdi mdi-target" /> <b>中坚甄选</b>进行中<template
                  v-if="kernelSelectCount"
                  >，共 <b>{{ kernelSelectCount }}</b> 名干员可供甄选</template
                >
                <a
                  class="kernel-select-link"
                  :href="wikiLink('卡池一览', '常驻中坚寻访&中坚甄选')"
                >
                  查看甄选范围 <i class="mdi mdi-arrow-right" />
                </a>
              </td>
            </tr>
            <tr>
              <td>
                <div class="shop-list">
                  <ShopCard
                    v-for="good in view.standard"
                    :key="good.goodId"
                    :background="STANDARD_BG"
                    :stock="good.availCount"
                    :price="good.price"
                  >
                    <ContractIcon v-bind="goodContract(good)" />
                  </ShopCard>
                  <ShopCard
                    v-for="good in view.kernel"
                    :key="good.goodId"
                    :background="
                      isKernelSelectGood(good) ? KERNEL_SELECT_BG : KERNEL_BG
                    "
                    :stock="good.availCount"
                    :price="good.price"
                  >
                    <ItemIcon
                      v-if="isKernelSelectGood(good)"
                      :name="kernelSelectIconName(good)"
                    />
                    <ContractIcon v-else v-bind="goodContract(good)" />
                  </ShopCard>
                </div>
              </td>
            </tr>
            <tr>
              <th>阶梯兑换</th>
            </tr>
            <tr>
              <td>
                <div class="shop-list">
                  <NTooltip
                    v-for="ladder in view.ladders"
                    :key="ladder.good.goodId"
                  >
                    <template #trigger>
                      <ShopCard progress :price="ladder.total">
                        <ItemIcon
                          :name="
                            wikiItemName(
                              ladder.steps[0].item,
                              ladder.steps[0].displayName,
                            )
                          "
                        >
                          <i
                            class="mdi mdi-autorenew mdi-rotate-90 ladder-badge"
                          />
                        </ItemIcon>
                      </ShopCard>
                    </template>
                    <LadderSteps :steps="ladder.steps" :chars="chars" />
                  </NTooltip>
                </div>
              </td>
            </tr>
            <tr>
              <th>通用信物与养成材料</th>
            </tr>
            <tr>
              <td>
                <div class="shop-list">
                  <ShopCard
                    v-for="good in view.materials"
                    :key="good.goodId"
                    :stock="good.availCount"
                    :price="good.price"
                  >
                    <ItemIcon
                      :name="wikiItemName(good.item!, good.displayName ?? '')"
                      :count="
                        good.item!.count > 1 ? good.item!.count : undefined
                      "
                    />
                  </ShopCard>
                </div>
              </td>
            </tr>
            <tr>
              <th class="high-shop-total">
                合计
                <ItemIcon
                  name="高级凭证"
                  :count="`${view.total}${view.hasUnlimited ? '+' : ''}`"
                />
              </th>
            </tr>
          </tbody>
        </table>
        <ul class="high-shop-countdown">
          <PoolCountdown
            v-if="view.standard[0]"
            pool="常驻标准寻访池"
            anchor="常驻标准寻访"
            :end="view.standard[0].goodEndTime + 1"
          />
          <PoolCountdown
            v-if="view.kernel[0]"
            pool="常驻中坚寻访池"
            anchor="常驻中坚寻访"
            :end="view.kernel[0].goodEndTime + 1"
          />
        </ul>

        <table v-if="hasReedition" class="wikitable high-shop-table">
          <tbody>
            <tr>
              <th class="reedition-banner">
                常驻往期复刻
                <NTooltip>
                  <template #trigger>
                    <i class="mdi mdi-help-circle-outline" />
                  </template>
                  本部分物品为往期实装的时装和/或危机合约干员及其信物。<br />
                  · 在未获得的情况下可消耗高级凭证/通用凭证兑换。<br />
                  · 本部分物品的兑换状态与其它获取渠道互通，已获得时无法再兑换。
                </NTooltip>
                <button
                  type="button"
                  class="reedition-toggle"
                  @click="expanded = !expanded"
                >
                  [{{ expanded ? "折叠" : "展开" }}]
                </button>
              </th>
            </tr>
            <template v-if="expanded">
              <tr>
                <td class="reedition-body">
                  <NTabs type="line" size="small" animated>
                    <NTabPane
                      v-if="view.reeditionOperators.length > 0"
                      name="operators"
                      tab="危机合约干员及其信物"
                    >
                      <p>
                        于限定寻访对应的活动商店复刻上架后常驻高级凭证区/通用凭证区<br />
                        <img
                          :src="wikiImage('图标_晶体合约赏金.png')"
                          width="20"
                          alt=""
                        /><img
                          :src="wikiImage('图标_合约赏金.png')"
                          width="20"
                          alt=""
                        />
                        也可以通过<a :href="wikiLink('危机合约')">危机合约</a
                        >结晶圣所 / （原）机密圣所兑换获得。
                      </p>
                      <p>
                        <i class="mdi mdi-account-badge" />
                        以下干员及其信物可供兑换：
                      </p>
                      <div class="shop-list">
                        <NTooltip
                          v-for="ladder in view.reeditionOperators"
                          :key="ladder.good.goodId"
                        >
                          <template #trigger>
                            <ShopCard progress :price="ladder.total">
                              <ContractIcon
                                v-bind="
                                  contractOf(
                                    ladder.steps[0].item.id,
                                    ladder.steps[0].displayName,
                                    ladder.steps[0].price,
                                  )
                                "
                              />
                            </ShopCard>
                          </template>
                          <LadderSteps :steps="ladder.steps" :chars="chars" />
                        </NTooltip>
                      </div>
                      <p>
                        兑换阶梯表
                        <PriceTag
                          v-if="reeditionPerOperator !== null"
                          currency="高级凭证"
                          :value="`${reeditionPerOperator}/干员`"
                        />
                      </p>
                      <LadderSteps
                        :steps="view.reeditionOperators[0].steps"
                        :chars="chars"
                        :size="50"
                      />
                    </NTabPane>
                    <NTabPane
                      v-if="view.reeditionSkins.length > 0"
                      name="skins"
                      tab="往期时装"
                    >
                      <p>
                        于<b>首次开放</b>的SideStory活动<b>（联动活动除外）</b>的活动商店复刻上架后常驻高级凭证区/通用凭证区<br />
                        <img
                          :src="wikiImage('图标_晶体合约赏金.png')"
                          width="20"
                          alt=""
                        /><img
                          :src="wikiImage('图标_合约赏金.png')"
                          width="20"
                          alt=""
                        />
                        部分时装也可以通过<a :href="wikiLink('危机合约')"
                          >危机合约</a
                        >结晶圣所 / （原）机密圣所兑换获得。
                      </p>
                      <p>
                        <b>小计</b>
                        <PriceTag
                          currency="高级凭证"
                          :value="view.reeditionSkinTotal"
                        />
                      </p>
                      <div class="shop-list">
                        <ShopCard
                          v-for="{ good, entry } in reeditionSkinCards"
                          :key="good.goodId"
                          :stock="good.availCount"
                          :price="good.price"
                        >
                          <SkinAvatar
                            v-if="entry"
                            :char-name="entry.charName"
                            :skin-index="entry.skinIndex"
                            :href="
                              wikiLink(`时装回廊/${entry.series}`, entry.anchor)
                            "
                            :title="`${entry.charName} · ${entry.skinName}`"
                          />
                          <span v-else class="reedition-skin-name">
                            {{ good.displayName }}
                          </span>
                        </ShopCard>
                      </div>
                    </NTabPane>
                  </NTabs>
                </td>
              </tr>
              <tr>
                <th class="high-shop-total">
                  合计
                  <ItemIcon
                    name="高级凭证"
                    :count="
                      view.reeditionOperatorTotal + view.reeditionSkinTotal
                    "
                  />
                </th>
              </tr>
            </template>
          </tbody>
        </table>
        <div v-if="updatedAt" class="high-shop-updated">
          商店数据更新于 {{ formatCstTime(updatedAt.getTime() / 1000) }}
        </div>
      </template>
    </div>
  </NConfigProvider>
</template>

<style scoped>
.high-shop-table {
  width: 100%;
  max-width: 45em;
  text-align: center;
  white-space: normal;
}

.high-shop-banner {
  height: 30px;
  color: #fff;
  font-weight: bold;
  text-align: left;
  vertical-align: middle;
  background:
    linear-gradient(135deg, #847419 40%, #0000 40%),
    linear-gradient(45deg, #ece305 75%, #0000 75%),
    linear-gradient(135deg, #ece305 75%, #0000 75%),
    linear-gradient(
      180deg,
      #0000 20%,
      #493800 20% 25%,
      #fff14c 25% 30%,
      #4f4646 30%,
      #494949 70%,
      #fff14c 70% 75%,
      #191919 75% 80%,
      #0000 80%
    ),
    #ece305;
}

.kernel-select-bar {
  position: relative;
  padding-right: 9em;
  color: #fff;
  text-align: left;
  background: linear-gradient(45deg, #0af9ff, #019bdb);
}

.kernel-select-link {
  position: absolute;
  top: 50%;
  right: 1%;
  padding: 0.2em 0.8em 0.2em 1em;
  background: #0086c2;
  border: 1px solid #fff9;
  border-radius: 15px;
  box-shadow: 0 2px 4px #0000005a;
  color: #fff !important;
  transform: translateY(-50%);
}

.shop-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.ladder-badge {
  color: #0098dc;
  font-size: 1.6em;
}

.high-shop-total {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1em;
}

.high-shop-countdown {
  margin-top: 0;
}

.reedition-banner {
  color: #fff;
  text-align: left;
  background:
    linear-gradient(135deg, #847419 10%, #ece305 25%, #0000 25%), #b7864c;
}

.reedition-toggle {
  float: right;
  padding: 0;
  background: none;
  border: none;
  color: inherit;
  font-weight: normal;
  cursor: pointer;
}

.reedition-body {
  text-align: left;
}

.reedition-skin-name {
  display: inline-block;
  width: 50px;
  font-size: 12px;
  line-height: 1.2;
  word-break: break-all;
}

.high-shop-status,
.high-shop-updated {
  color: #72777d;
  font-size: 0.9em;
}

:global(.prts-widget-dark .high-shop-status),
:global(.prts-widget-dark .high-shop-updated) {
  color: #a2a9b1;
}
</style>
