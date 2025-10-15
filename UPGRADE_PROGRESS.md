# TypeScript 5.9 Upgrade Progress

## Status: 52% Complete (145/302 errors remaining)

### Completed Work

#### Enabled Strict Options
- ✅ `noUncheckedIndexedAccess` in tsconfig.app.json
- ✅ `noUncheckedIndexedAccess` in tsconfig.node.json  
- ✅ `exactOptionalPropertyTypes` in tsconfig.app.json
- ✅ `exactOptionalPropertyTypes` in tsconfig.node.json

#### Fixed Files (157 errors resolved)
**Major widgets:**
- EquipList/index.vue (31 errors → 1)
- MedalList/MedalList.vue (20 errors → 2)
- ArkSign widget (4 files, 30+ errors)
- ISEvent widgets (2 files, 28 errors)

**Utility files:**
- CVList.ts, ISEvent.ts, utils.ts, vite.config.ts
- Cost.vue, FilterRow.vue
- EquipList/equipData.ts, i18n.ts, FilterSub.vue, SubContainer.vue
- GachaSimulator files (base.ts, math.ts, newbee.ts, rule.ts, index.vue)
- VoiceTable files (VoiceTable.vue, VoiceTableMobile.vue)
- XbMapViewer/Map.vue, MedalList/MedalGroup.vue, MemoryList/Memory.vue
- PenguinWidget.vue, HrCalculator/utils.ts, EnemiesListV2/FilterGroup.vue

**Lint status:**
- ✅ All ESLint errors resolved

### Remaining Work (145 errors in 20 files)

Files with most errors:
- HrCalculator/index.vue (18)
- CharList/index.vue (16)
- EnemiesListV2/index.vue (13)
- SOExpCalc/SOExpCalc.vue (11)
- MemoryList/index.vue (11)
- Spine/Spine.vue (10)
- MedalList/MedalShowcase.vue (10)
- EquipList/components/Equip.vue (10)
- ItemDemand.vue (8)
- MedalList/MedalStats.vue (7)
- Plus 10 more files with 1-5 errors each

### Fix Patterns Established

#### For `noUncheckedIndexedAccess` errors:
```typescript
// Pattern 1: Safe array access
const item = array[index];
if (item) {
  item.property;
}

// Pattern 2: Safe Record access
const value = record[key];
if (value) {
  use(value);
}

// Pattern 3: Optional chaining
array[index]?.property
record[key]?.method()
```

#### For `exactOptionalPropertyTypes` errors:
```vue
<!-- Pattern 1: Conditional v-bind -->
<Component v-bind="prop ? { prop } : {}" />

<!-- Pattern 2: Combined conditionals -->
<Component v-bind="{
  ...(prop1 ? { prop1 } : {}),
  ...(prop2 ? { prop2 } : {}),
}" />
```

### Next Steps

All remaining errors follow the established patterns and can be fixed using:
1. Adding null checks before indexed access
2. Using optional chaining for safe property access
3. Conditionally binding props instead of passing undefined
4. Filtering undefined values from arrays/maps

The remaining work is straightforward application of these patterns to the 20 remaining files.
