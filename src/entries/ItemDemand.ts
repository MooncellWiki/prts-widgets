import { createApp } from 'vue'
import "virtual:windi.css";
import ItemDemand from "../widgets/ItemDemand.vue";

const ele = document.getElementById("root");
if (ele?.dataset?.item) {
    createApp(ItemDemand,{item:ele.dataset.item}).mount(ele)
} else {
  console.error("data-item or ele not found", ele);
}
